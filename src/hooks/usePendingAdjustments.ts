import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { getPendingAdjustmentCount } from "@/lib/adjustments"

export function usePendingAdjustmentCount() {
    const { profile } = useAuth()
    const [count, setCount] = useState(0)
    const [loading, setLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (profile?.role !== "admin") {
            setCount(0)
            return 0
        }
        setLoading(true)
        try {
            const n = await getPendingAdjustmentCount()
            setCount(n)
            return n
        } catch {
            return 0
        } finally {
            setLoading(false)
        }
    }, [profile?.role])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { count, loading, refresh }
}
