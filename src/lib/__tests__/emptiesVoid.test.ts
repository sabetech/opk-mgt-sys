import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", () => ({
    pb: {
        collection: vi.fn(),
    },
    getFullListInBatches: vi.fn(),
}));

vi.mock("@/lib/emptiesStock", () => ({
    moveYardStock: vi.fn(),
}));

import { pb, getFullListInBatches } from "@/lib/pocketbase";
import { moveYardStock } from "@/lib/emptiesStock";
import {
    evaluateVoidRequest,
    voidEmptiesReturn,
    VoidBlockedError,
    type VoidCheckInput,
} from "../emptiesVoid";

const baseInput: VoidCheckInput = {
    activity: "customer_empties_return",
    source: "return_page",
    voidedAt: null,
    refundQty: 0,
    refundLinked: false,
    details: [{ productId: "p1", quantity: 5 }],
    groundByProduct: { p1: 10 },
};

describe("evaluateVoidRequest", () => {
    it("allows a clean return_page entry with enough ground stock", () => {
        expect(evaluateVoidRequest(baseInput)).toEqual({ ok: true });
    });

    it("blocks non-return activities", () => {
        const r = evaluateVoidRequest({ ...baseInput, activity: "customer_purchase" });
        expect(r).toMatchObject({ ok: false, code: "WRONG_ACTIVITY" });
    });

    it("blocks entries not recorded on the return page", () => {
        const r = evaluateVoidRequest({ ...baseInput, source: "pos" });
        expect(r).toMatchObject({ ok: false, code: "NOT_RETURN_PAGE" });
    });

    it("blocks legacy entries with no source attribution", () => {
        const r = evaluateVoidRequest({ ...baseInput, source: null });
        expect(r).toMatchObject({ ok: false, code: "NOT_RETURN_PAGE" });
    });

    it("blocks entries already voided", () => {
        const r = evaluateVoidRequest({ ...baseInput, voidedAt: "2026-10-01 10:00:00.000Z" });
        expect(r).toMatchObject({ ok: false, code: "ALREADY_VOIDED" });
    });

    it("blocks when a refund was stamped on the log", () => {
        const r = evaluateVoidRequest({ ...baseInput, refundQty: 3 });
        expect(r).toMatchObject({ ok: false, code: "REFUND_PAID" });
    });

    it("blocks when a deposit row links back to the log", () => {
        const r = evaluateVoidRequest({ ...baseInput, refundLinked: true });
        expect(r).toMatchObject({ ok: false, code: "REFUND_PAID" });
    });

    it("blocks when ground stock is short for any product (crates already shipped)", () => {
        const r = evaluateVoidRequest({
            ...baseInput,
            details: [
                { productId: "p1", quantity: 5 },
                { productId: "p2", quantity: 4 },
            ],
            groundByProduct: { p1: 5, p2: 3 },
        });
        expect(r).toMatchObject({ ok: false, code: "GROUND_INSUFFICIENT", offendingProducts: ["p2"] });
    });

    it("blocks when the yard row is missing entirely (ground defaults to 0)", () => {
        const r = evaluateVoidRequest({ ...baseInput, groundByProduct: {} });
        expect(r).toMatchObject({ ok: false, code: "GROUND_INSUFFICIENT", offendingProducts: ["p1"] });
    });
});

type MethodName = "getOne" | "getFullList" | "update";
type CollectionHandlers = Record<
    string,
    Partial<Record<MethodName, (...args: never[]) => unknown>>
>;

function mockCollection(handlers: CollectionHandlers) {
    return (name: string) => {
        const h = handlers[name];
        if (!h) throw new Error(`Unexpected collection access: ${name}`);
        return {
            getOne: h.getOne ?? vi.fn(),
            getFullList: h.getFullList ?? vi.fn(),
            update: h.update ?? vi.fn(),
        } as unknown as ReturnType<typeof pb.collection>;
    };
}

function header(overrides: Record<string, unknown> = {}) {
    return {
        id: "log1",
        activity: "customer_empties_return",
        source: "return_page",
        voided_at: "",
        refund_qty: 0,
        total_quantity: 5,
        ...overrides,
    };
}

describe("voidEmptiesReturn", () => {
    beforeEach(() => {
        vi.mocked(pb.collection).mockReset();
        vi.mocked(getFullListInBatches).mockReset();
        vi.mocked(moveYardStock).mockReset();
    });

    it("rejects an empty reason before touching the ledger", async () => {
        await expect(voidEmptiesReturn("log1", { reason: "  ", userId: "u1" })).rejects.toThrow(
            /reason is required/i
        );
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it("stamps the void and inverts the yard tally on the happy path", async () => {
        const updateSpy = vi.fn(async (_id: string, body: Record<string, unknown>) => ({
            id: "log1",
            ...body,
        }));
        vi.mocked(pb.collection).mockImplementation(
            mockCollection({
                empties_log: {
                    getOne: vi.fn(async () => header()),
                    update: updateSpy,
                },
                empties_log_detail: {
                    getFullList: vi.fn(async () => [{ product_id: "p1", quantity: 5 }]),
                },
                crate_deposits: { getFullList: vi.fn(async () => []) },
            })
        );
        vi.mocked(getFullListInBatches).mockResolvedValue([
            { product_id: "p1", quantity_on_ground: 8 },
        ]);
        vi.mocked(moveYardStock).mockResolvedValue(undefined);

        const summary = await voidEmptiesReturn("log1", { reason: "wrong customer", userId: "u1" });

        expect(updateSpy).toHaveBeenCalledWith(
            "log1",
            expect.objectContaining({
                voided_at: expect.any(String),
                void_reason: "wrong customer",
                voided_by: "u1",
            })
        );
        expect(moveYardStock).toHaveBeenCalledWith([
            { productId: "p1", groundDelta: -5, tradeDelta: 5 },
        ]);
        expect(summary).toEqual({
            balanceDelta: -5,
            yardMoves: [{ productId: "p1", groundDelta: -5, tradeDelta: 5 }],
            yardApplied: true,
        });
    });

    it("throws VoidBlockedError with no writes when a guard fails", async () => {
        const updateSpy = vi.fn();
        vi.mocked(pb.collection).mockImplementation(
            mockCollection({
                empties_log: {
                    getOne: vi.fn(async () => header({ refund_qty: 2 })),
                    update: updateSpy,
                },
                empties_log_detail: {
                    getFullList: vi.fn(async () => [{ product_id: "p1", quantity: 5 }]),
                },
                crate_deposits: { getFullList: vi.fn(async () => []) },
            })
        );
        vi.mocked(getFullListInBatches).mockResolvedValue([
            { product_id: "p1", quantity_on_ground: 8 },
        ]);

        await expect(voidEmptiesReturn("log1", { reason: "r", userId: "u1" })).rejects.toMatchObject({
            name: "VoidBlockedError",
            code: "REFUND_PAID",
        });
        expect(updateSpy).not.toHaveBeenCalled();
        expect(moveYardStock).not.toHaveBeenCalled();
    });

    it("still voids the ledger when the yard tally fails (best-effort)", async () => {
        const updateSpy = vi.fn(async (_id: string, body: Record<string, unknown>) => ({
            id: "log1",
            ...body,
        }));
        vi.mocked(pb.collection).mockImplementation(
            mockCollection({
                empties_log: {
                    getOne: vi.fn(async () => header({ total_quantity: 3 })),
                    update: updateSpy,
                },
                empties_log_detail: {
                    getFullList: vi.fn(async () => [{ product_id: "p1", quantity: 3 }]),
                },
                crate_deposits: { getFullList: vi.fn(async () => []) },
            })
        );
        vi.mocked(getFullListInBatches).mockResolvedValue([
            { product_id: "p1", quantity_on_ground: 5 },
        ]);
        vi.mocked(moveYardStock).mockRejectedValue(new Error("network"));

        const summary = await voidEmptiesReturn("log1", { reason: "r", userId: "u1" });

        expect(updateSpy).toHaveBeenCalledWith(
            "log1",
            expect.objectContaining({ void_reason: "r", voided_by: "u1" })
        );
        expect(summary.yardApplied).toBe(false);
        expect(summary.balanceDelta).toBe(-3);
    });

    it("maps a failed check to a typed VoidBlockedError", async () => {
        vi.mocked(pb.collection).mockImplementation(
            mockCollection({
                empties_log: {
                    getOne: vi.fn(async () => header({ source: "pos" })),
                    update: vi.fn(),
                },
                empties_log_detail: {
                    getFullList: vi.fn(async () => [{ product_id: "p1", quantity: 5 }]),
                },
                crate_deposits: { getFullList: vi.fn(async () => []) },
            })
        );
        vi.mocked(getFullListInBatches).mockResolvedValue([
            { product_id: "p1", quantity_on_ground: 8 },
        ]);

        const err = await voidEmptiesReturn("log1", { reason: "r", userId: "u1" }).catch((e) => e);
        expect(err).toBeInstanceOf(VoidBlockedError);
        expect((err as VoidBlockedError).code).toBe("NOT_RETURN_PAGE");
    });
});
