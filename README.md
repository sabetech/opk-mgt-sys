# OPK Management System

A robust, full-stack management system designed for distribution businesses, specializing in inventory tracking, warehouse logistics, and customer empties management.

## 🚀 Tech Stack

- **Frontend**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) & [Radix UI](https://www.radix-ui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Backend/Database**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Storage)
- **State Management**: React Context API
- **Notifications**: [Sonner](https://sonner.stevenly.me/)

## 🛠️ Key Features

### 👤 User & Role Management
- **RBAC (Role-Based Access Control)**: Custom roles including Admin, Operations Manager, Sales Manager, Empties Manager, Cashier, and Auditor.
- **Admin Dashboard**: Manage employee accounts, update roles, and create new users.
- **Secure Authentication**: Powerded by Supabase Auth with custom database triggers for profile synchronization.

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
- **Delivery Tracking**: Record vehicle numbers and associate deliveries with Purchase Orders.

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A Supabase project

### 1. Clone & Install
```bash
git clone <repository-url>
cd opk-mgt-sys
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup
Run the provided SQL scripts in the Supabase SQL Editor to initialize the schema. The scripts are located in the `sql_scripts/` directory:
1. `sql_scripts/create_profiles_table.sql`: Sets up user roles and RLS.
2. `sql_scripts/universal_db_fix.sql`: Consolidates all necessary RLS and Auth trigger fixes.
3. `sql_scripts/create_inventory_logs_table.sql`: Initializes stock tracking.
*(Note: Additional module-specific SQL files are also located in the `sql_scripts/` directory.)*

### 4. Run Locally
```bash
npm run dev
```

## 🔒 Security
The project utilizes **Row Level Security (RLS)** in Supabase to ensure data privacy. Most tables are protected by policies that check the `user_metadata` role assigned via Supabase Auth, preventing unauthorized access to sensitive management features.

---
Developed by **sabetech**
