import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"
import Login from "@/pages/Login"
import DashboardLayout from "@/layouts/DashboardLayout"
import DashboardOverview from "@/pages/DashboardOverview"
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
import Loadout from "@/pages/warehouse/Loadout"
import TakeStock from "@/pages/warehouse/TakeStock"
import Breakages from "@/pages/warehouse/Breakages"
import StockReport from "@/pages/warehouse/StockReport"
import Sale from "@/pages/pos/Sale"
import Orders from "@/pages/pos/Orders"
import OrderDetails from "@/pages/pos/OrderDetails"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/context/AuthContext"
import { Toaster } from "sonner"
import AddUser from "@/pages/admin/AddUser"
import ManageUsers from "@/pages/admin/ManageUsers"
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
              <Route index element={<DashboardOverview />} />

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
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <PlaceholderPage title="Adjust Stock" />
                  </ProtectedRoute>
                } />
                <Route path="record-receivable" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <RecordReceivable />
                  </ProtectedRoute>
                } />
                <Route path="receivables-log" element={<ReceivablesLog />} />
                <Route path="inventory-log" element={<InventoryLog />} />
                <Route path="add-loadout" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <AddLoadout />
                  </ProtectedRoute>
                } />
                <Route path="loadout" element={<Loadout />} />
                <Route path="take-stock" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <TakeStock />
                  </ProtectedRoute>
                } />
                <Route path="breakages" element={
                  <ProtectedRoute allowedRoles={['admin', 'operations_manager']}>
                    <Breakages />
                  </ProtectedRoute>
                } />
                <Route path="stock-reports" element={<StockReport />} />
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
                  <ProtectedRoute allowedRoles={['admin', 'cashier', 'auditor']}>
                    <Orders />
                  </ProtectedRoute>
                } />
                <Route path="orders/:id" element={<OrderDetails />} />
              </Route>

              {/* Reports */}
              <Route path="reports">
                <Route index element={<Navigate to="sales" replace />} />
                <Route path="sales" element={<PlaceholderPage title="Sales Report" />} />
              </Route>

              {/* Admin */}
              <Route path="admin" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Outlet />
                </ProtectedRoute>
              }>
                <Route path="manage-users" element={<ManageUsers />} />
                <Route path="add-user" element={<AddUser />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
