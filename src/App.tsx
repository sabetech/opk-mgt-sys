import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"
import Login from "@/pages/Login"
import DashboardLayout from "@/layouts/DashboardLayout"
import PlaceholderPage from "@/components/PlaceholderPage"
import AddCustomer from "@/pages/customers/AddCustomer"
import CustomerList from "@/pages/customers/CustomerList"
import CustomerReturnEmpties from "@/pages/customers/CustomerReturnEmpties"
import CratesOverview from "@/pages/crates/CratesOverview"
import CratesBroughtIn from "@/pages/crates/CratesBroughtIn"
import CratesReturned from "@/pages/crates/CratesReturned"
import ReturnCrates from "@/pages/crates/ReturnCrates"
import Products from "@/pages/warehouse/Products"
import PendingOrders from "@/pages/warehouse/PendingOrders"
import CompletedOrders from "@/pages/warehouse/CompletedOrders"
import RecordReceivable from "@/pages/warehouse/RecordReceivable"
import ReceivablesLog from "@/pages/warehouse/ReceivablesLog"
import InventoryLog from "@/pages/warehouse/InventoryLog"
import AddLoadout from "@/pages/warehouse/AddLoadout"
import RecordVSEReturn from "@/pages/warehouse/RecordVSEReturn"
import RecordVSESale from "@/pages/pos/RecordVSESale"
import Loadout from "@/pages/warehouse/Loadout"
import TakeStock from "@/pages/warehouse/TakeStock"
import Breakages from "@/pages/warehouse/Breakages"
import StockReport from "@/pages/warehouse/StockReport"
import Sale from "@/pages/pos/Sale"
import Orders from "@/pages/pos/Orders"
import OrderDetails from "@/pages/pos/OrderDetails"
import ManageProducts from "@/pages/pos/ManageProducts"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/context/AuthContext"
import { Toaster } from "sonner"
import AddUser from "@/pages/admin/AddUser"
import ManageUsers from "@/pages/admin/ManageUsers"
import Settings from "@/pages/admin/Settings"
import StockAdjustmentRequests from "@/pages/admin/StockAdjustmentRequests"
import StocksComingIn from "@/pages/operations/StocksComingIn"
import StocksComingInLog from "@/pages/operations/StocksComingInLog"
import Adjustments from "@/pages/operations/Adjustments"
import AdjustmentRequests from "@/pages/operations/AdjustmentRequests"
import ReloadTruckEmpties from "@/pages/operations/ReloadTruckEmpties"
import TruckReloadsToGGBL from "@/pages/operations/TruckReloadsToGGBL"
import AdjustmentsLog from "@/pages/operations/AdjustmentsLog"
import TakeEmptiesCount from "@/pages/operations/TakeEmptiesCount"
import EmptiesCountReports from "@/pages/operations/EmptiesCountReports"
import SalesReport from "@/pages/reports/SalesReport"
import OperationsOverview from "@/pages/operations/OperationsOverview"
import Setup from "@/pages/operations/Setup"
import RoleLanding from "@/components/RoleLanding"
import RecordFieldSale from "@/pages/vse/RecordFieldSale"
import MyFieldSales from "@/pages/vse/MyFieldSales"
import VSESalesApprovals from "@/pages/approvals/VSESalesApprovals"
import VSEEmptiesApprovals from "@/pages/approvals/VSEEmptiesApprovals"
import ProtectedRoute from "@/components/ProtectedRoute"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<RoleLanding />} />

              {/* Customers */}
              <Route path="customers">
                <Route index element={<Navigate to="all" replace />} />
                <Route path="add" element={
                  <ProtectedRoute allowedRoles={['admin', 'empties_manager', 'sales_manager']}>
                    <AddCustomer />
                  </ProtectedRoute>
                } />
                <Route path="all" element={<CustomerList />} />
                <Route path="return-crates" element={
                  <ProtectedRoute allowedRoles={['admin', 'empties_manager', 'sales_manager']}>
                    <CustomerReturnEmpties />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Crates Mgt */}
              <Route path="crates">
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<CratesOverview />} />
                <Route path="brought-in" element={<CratesBroughtIn />} />
                <Route path="returned" element={<CratesReturned />} />
                <Route path="return-crates" element={
                  <ProtectedRoute allowedRoles={['admin', 'empties_manager']}>
                    <ReturnCrates />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Warehouse */}
              <Route path="warehouse">
                <Route index element={<Navigate to="products" replace />} />
                <Route path="products" element={<Products />} />
                <Route path="pending-orders" element={<PendingOrders />} />
                <Route path="completed-orders" element={<CompletedOrders />} />
                <Route path="adjust-stock" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <PlaceholderPage title="Adjust Stock" />
                  </ProtectedRoute>
                } />
                <Route path="record-receivable" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <RecordReceivable />
                  </ProtectedRoute>
                } />
                <Route path="receivables-log" element={<ReceivablesLog />} />
                <Route path="inventory-log" element={<InventoryLog />} />
                <Route path="add-loadout" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AddLoadout />
                  </ProtectedRoute>
                } />
                <Route path="record-vse-returns" element={
                  <ProtectedRoute allowedRoles={['admin', 'warehouse_manager']}>
                    <RecordVSEReturn />
                  </ProtectedRoute>
                } />
                <Route path="loadout" element={<Loadout />} />
                <Route path="take-stock" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager']}>
                    <TakeStock />
                  </ProtectedRoute>
                } />
                <Route path="breakages" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager']}>
                    <Breakages />
                  </ProtectedRoute>
                } />
                <Route path="stock-reports" element={
                  <ProtectedRoute allowedRoles={['admin', 'auditor', 'operations_manager', 'warehouse_manager']}>
                    <StockReport />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Operations */}
              <Route path="operations" element={<Outlet />}>
                <Route index element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager', 'auditor', 'sales_manager']}>
                    <OperationsOverview />
                  </ProtectedRoute>
                } />
                <Route path="reload-truck-empties" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <ReloadTruckEmpties />
                  </ProtectedRoute>
                } />
                <Route path="stocks-coming-in" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'auditor']}>
                    <StocksComingIn />
                  </ProtectedRoute>
                } />
                <Route path="adjustments" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager']}>
                    <Adjustments />
                  </ProtectedRoute>
                } />
                <Route path="adjustment-requests" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager', 'auditor']}>
                    <AdjustmentRequests />
                  </ProtectedRoute>
                } />
                <Route path="adjustments-log" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'auditor', 'sales_manager']}>
                    <AdjustmentsLog />
                  </ProtectedRoute>
                } />
                <Route path="empties-count" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager', 'empties_manager']}>
                    <TakeEmptiesCount />
                  </ProtectedRoute>
                } />
                <Route path="empties-count-reports" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'warehouse_manager', 'auditor', 'empties_manager']}>
                    <EmptiesCountReports />
                  </ProtectedRoute>
                } />
                <Route path="vse-empties-approvals" element={
                  <ProtectedRoute allowedRoles={['admin', 'empties_manager']}>
                    <VSEEmptiesApprovals />
                  </ProtectedRoute>
                } />
                <Route path="stocks-coming-in-log" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'auditor']}>
                    <StocksComingInLog />
                  </ProtectedRoute>
                } />
                <Route path="truck-reloads-to-ggbl" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager', 'auditor']}>
                    <TruckReloadsToGGBL />
                  </ProtectedRoute>
                } />
                <Route path="setup" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <Setup />
                  </ProtectedRoute>
                } />
              </Route>

              {/* POS */}
              <Route path="pos">
                <Route index element={<Navigate to="sale" replace />} />
                <Route path="sale" element={
                  <ProtectedRoute allowedRoles={['admin', 'sales_manager']}>
                    <Sale />
                  </ProtectedRoute>
                } />
                <Route path="orders" element={
                  <ProtectedRoute allowedRoles={['admin', 'sales_manager', 'cashier', 'auditor', 'account_manager']}>
                    <Orders />
                  </ProtectedRoute>
                } />
                <Route path="orders/:id" element={<OrderDetails />} />
                <Route path="manage-products" element={
                  <ProtectedRoute allowedRoles={['admin', 'sales_manager']}>
                    <ManageProducts />
                  </ProtectedRoute>
                } />
                <Route path="record-vse-sales" element={
                  <ProtectedRoute allowedRoles={['admin', 'sales_manager']}>
                    <RecordVSESale />
                  </ProtectedRoute>
                } />
              </Route>

              {/* VSE field sales (mobile-first, vse role only) */}
              <Route path="field-sales">
                <Route path="record" element={
                  <ProtectedRoute allowedRoles={['vse', 'admin']}>
                    <RecordFieldSale />
                  </ProtectedRoute>
                } />
                <Route path="mine" element={
                  <ProtectedRoute allowedRoles={['vse', 'admin']}>
                    <MyFieldSales />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Field-sale approvals */}
              <Route path="approvals">
                <Route path="vse-sales" element={
                  <ProtectedRoute allowedRoles={['account_manager', 'admin']}>
                    <VSESalesApprovals />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Reports */}
              <Route path="reports">
                <Route index element={<Navigate to="sales" replace />} />
                <Route path="sales" element={<SalesReport />} />
              </Route>

              {/* Admin */}
              <Route path="admin" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Outlet />
                </ProtectedRoute>
              }>
                <Route path="manage-users" element={<ManageUsers />} />
                <Route path="add-user" element={<AddUser />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Stock adjustment approvals: viewable beyond admin, but only
                  admins can approve/reject (also enforced by API rules). */}
              <Route path="admin/stock-adjustment-requests" element={
                <ProtectedRoute allowedRoles={['admin', 'sales_manager', 'operations_manager']}>
                  <StockAdjustmentRequests />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
