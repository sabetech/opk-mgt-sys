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

function App() {
  return (
    <BrowserRouter>
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
            <Route path="products" element={<PlaceholderPage title="Products" />} />
            <Route path="pending-orders" element={<PlaceholderPage title="Pending Orders" />} />
            <Route path="adjust-stock" element={<PlaceholderPage title="Adjust Stock" />} />
            <Route path="record-receivable" element={<PlaceholderPage title="Record Receivable" />} />
            <Route path="receivables-log" element={<PlaceholderPage title="Receivables Log" />} />
            <Route path="inventory-log" element={<PlaceholderPage title="Inventory Transactions Log" />} />
            <Route path="add-loadout" element={<PlaceholderPage title="Add Loadout" />} />
            <Route path="loadout" element={<PlaceholderPage title="Loadout" />} />
            <Route path="take-stock" element={<PlaceholderPage title="Take Stock" />} />
            <Route path="stock-reports" element={<PlaceholderPage title="Stock Reports" />} />
          </Route>

          {/* POS */}
          <Route path="pos">
            <Route index element={<Navigate to="sale" replace />} />
            <Route path="sale" element={<PlaceholderPage title="POS Sale" />} />
            <Route path="orders" element={<PlaceholderPage title="POS Orders" />} />
          </Route>

          {/* Reports */}
          <Route path="reports">
            <Route index element={<Navigate to="sales" replace />} />
            <Route path="sales" element={<PlaceholderPage title="Sales Report" />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
