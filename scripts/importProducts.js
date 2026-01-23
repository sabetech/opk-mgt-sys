import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase environment variables not found.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importProducts() {
    const csvFilePath = path.resolve(__dirname, '../data/products.csv');

    if (!fs.existsSync(csvFilePath)) {
        console.error(`Error: File not found at ${csvFilePath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(csvFilePath, 'utf8');

    Papa.parse(fileContent, {
        header: false, // We will manually handle headers because of the multi-line issue
        skipEmptyLines: true,
        complete: async (results) => {
            const rows = results.data;

            // inspect first few rows to confirm where data starts
            // Based on file inspection:
            // Row 0: SKU NAME, Returnable, CODE NAME, " WHOLE
            // Row 1: SALE ", RETAIL
            // Row 2: ABC Golden Lag... (Data starts here)

            const dataRows = rows.slice(2);
            const products = dataRows.map((row) => {
                // row index mapping based on: SKU NAME, Returnable, CODE NAME, WHOLE SALE, RETAIL
                // row is an array of values
                const skuName = row[0]?.trim();
                const returnableStr = row[1]?.trim();
                const codeName = row[2]?.trim();
                const wholesaleStr = row[3]?.trim(); // might contain commas and quotes which papaparse handles
                const retailStr = row[4]?.trim();

                if (!skuName) return null; // skip empty rows

                const isReturnable = returnableStr?.toLowerCase() === 'returnable';
                const wholesalePrice = parseFloat(wholesaleStr?.replace(/,/g, '') || '0');
                const retailPrice = parseFloat(retailStr?.replace(/,/g, '') || '0');

                return {
                    sku_name: skuName,
                    returnable: isReturnable,
                    code_name: codeName,
                    wholesale_price: wholesalePrice,
                    retail_price: retailPrice,
                };
            }).filter(p => p !== null);

            console.log(`Found ${products.length} products to insert.`);

            const { data, error } = await supabase
                .from('products')
                .insert(products)
                .select();

            if (error) {
                console.error('Error inserting data:', error);
            } else {
                console.log('Successfully imported products:', data.length);
            }
        },
        error: (err) => {
            console.error('Error parsing CSV:', err);
        }
    });
}

importProducts();
