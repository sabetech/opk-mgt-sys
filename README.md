# OPK Management System

A robust, full-stack management system designed for distribution businesses, specializing in inventory tracking, warehouse logistics, and customer empties management.

## 🚀 Tech Stack

- **Frontend**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) & [Radix UI](https://www.radix-ui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Backend/Database**: [PocketBase](https://pocketbase.io/) (embedded SQLite, Auth, Storage)
- **State Management**: React Context API
- **Notifications**: [Sonner](https://sonner.stevenly.me/)

## 🛠️ Key Features

### 👤 User & Role Management
- **RBAC (Role-Based Access Control)**: Custom roles including Admin, Operations Manager, Sales Manager, Empties Manager, Cashier, and Auditor.
- **Admin Dashboard**: Manage employee accounts, update roles, and create new users.
- **Secure Authentication**: Powered by PocketBase Auth with a `role` field on the users collection and collection-level access rules.

### 📦 Warehouse & Inventory
- **Inventory Logs**: Real-time tracking of stock levels, receipts, and sales.
- **Stock Reports**: Detailed analytics on product performance and low-stock alerts.
- **Order Management**: Comprehensive flow for pending and completed warehouse orders.
- **Loadouts**: Management of VSE (Value-Added Service Executive) loadouts and performance.

### 💰 POS & Sales
- **Order Processing**: Streamlined sales entry and order approval flow.
- **Customer Management**: Detailed tracking of customer types (Retailers, Wholesalers) and credit status.
- **Empties Tracking**: Specialized logic for tracking returnables (crates/bottles) with automated balance updates.

### 🚛 Logistics & Crates
- **Crate Management**: Log incoming and outgoing crates from suppliers and customers.
- **Delivery Tracking**: Record vehicle numbers and associate deliveries with Purchase Orders (including PO image uploads stored as PocketBase file fields).

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A running [PocketBase](https://pocketbase.io/) instance (download the binary and run `./pocketbase serve`)

### 1. Clone & Install
```bash
git clone <repository-url>
cd opk-mgt-sys
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory and point it at your PocketBase instance:
```env
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

### 3. Database Setup
Start PocketBase, then run the setup script to create all collections, seed reference data, import products from `data/products.csv`, seed empties rows, and create the initial admin user:
```bash
PB_SUPERUSER_EMAIL=your@superuser.com \
PB_SUPERUSER_PASSWORD=your_password \
node scripts/setup-pocketbase.js
```
The script is idempotent — existing collections are skipped, so it is safe to re-run.

### 4. Run Locally
```bash
npm run dev
```

## 🔒 Security
Access control is enforced through PocketBase collection rules. Authenticated users can only manage records permitted by their role (`@request.auth.role`), and the `users` collection restricts listing/editing to admins and self.

---
Developed by **sabetech**