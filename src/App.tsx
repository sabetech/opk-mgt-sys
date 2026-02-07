import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
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
import StockReport from "@/pages/warehouse/StockReport"
import Sale from "@/pages/pos/Sale"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider defaultTheme="light">
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardOverview />} />

            {/* Customers */}
            <Route path="customers">
              <Route index element={<Navigate to="all" replace />} />
              <Route path="add" element={<AddCustomer />} />
              <Route path="all" element={<CustomerList />} />
              <Route path="return-crates" element={<CustomerReturnEmpties />} />
            </Route>

            {/* Crates Mgt */}
            <Route path="crates">
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<CratesOverview />} />
              <Route path="brought-in" element={<CratesBroughtIn />} />
              <Route path="returned" element={<CratesReturned />} />
              <Route path="return-crates" element={<ReturnCrates />} />
            </Route>

            {/* Warehouse */}
            <Route path="warehouse">
              <Route index element={<Navigate to="products" replace />} />
              <Route path="products" element={<Products />} />
              <Route path="pending-orders" element={<PendingOrders />} />
              <Route path="completed-orders" element={<CompletedOrders />} />
              <Route path="adjust-stock" element={<PlaceholderPage title="Adjust Stock" />} />
              <Route path="record-receivable" element={<RecordReceivable />} />
              <Route path="receivables-log" element={<ReceivablesLog />} />
              <Route path="inventory-log" element={<InventoryLog />} />
              <Route path="add-loadout" element={<AddLoadout />} />
              <Route path="loadout" element={<Loadout />} />
              <Route path="take-stock" element={<TakeStock />} />
              <Route path="stock-reports" element={<StockReport />} />
            </Route>

            {/* POS */}
            <Route path="pos">
              <Route index element={<Navigate to="sale" replace />} />
              <Route path="sale" element={<Sale />} />
              <Route path="orders" element={<PlaceholderPage title="POS Orders" />} />
            </Route>

            {/* Reports */}
            <Route path="reports">
              <Route index element={<Navigate to="sales" replace />} />
              <Route path="sales" element={<PlaceholderPage title="Sales Report" />} />
            </Route>
          </Route>
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
