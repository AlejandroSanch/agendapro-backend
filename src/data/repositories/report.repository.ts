import { RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';

// ── Row interfaces ──────────────────────────────────────────────────────────

interface SummaryRow extends RowDataPacket {
  totalIngresos: number;
  totalCitas: number;
  totalCancelaciones: number;
}

interface DailyRow extends RowDataPacket {
  label: string;
  ingresos: number;
  citas: number;
  cancelaciones: number;
}

interface CustomerStatsRow extends RowDataPacket {
  totalCustomers: number;
  recurringCustomers: number;
}

interface InventorySummaryRow extends RowDataPacket {
  totalValue: number;
  lowStockCount: number;
}

interface InventoryTopRow extends RowDataPacket {
  nombre: string;
  stock: number;
  valor: number;
}

interface StaffRankingRow extends RowDataPacket {
  nombre: string;
  citas: number;
  ingresos: number;
}

// ── Public interfaces ───────────────────────────────────────────────────────

export interface ReportSummary {
  totalIngresos: number;
  totalCitas: number;
  totalCustomers: number;
  recurringPct: number;
  inventoryValue: number;
  lowStockItems: number;
}

export interface DailyChartEntry {
  label: string;
  ingresos: number;
  citas: number;
  cancelaciones: number;
}

export interface StaffRankEntry {
  nombre: string;
  citas: number;
  ingresos: number;
  avatar: string;
}

export interface InventoryRankEntry {
  nombre: string;
  stock: number;
  valor: number;
}

export interface ReportStats {
  summary: ReportSummary;
  charts: { daily: DailyChartEntry[] };
  rankings: {
    staff: StaffRankEntry[];
    inventory: InventoryRankEntry[];
  };
}

// ── Repository functions ────────────────────────────────────────────────────

export async function getReportStats(tenantDbName: string): Promise<ReportStats> {
  const db = getControlPool();
  const t = q(tenantDbName);

  // 1. Resumen general de citas e ingresos
  const [summaryRows] = await db.query<SummaryRow[]>(`
    SELECT
      COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled','no_show') THEN s.price_cents ELSE 0 END), 0) / 100 AS totalIngresos,
      COUNT(CASE WHEN a.status NOT IN ('cancelled','no_show') THEN 1 END) AS totalCitas,
      COUNT(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 END) AS totalCancelaciones
    FROM ${t}.appointments a
    LEFT JOIN ${t}.appointment_services aps ON a.id = aps.appointment_id
    LEFT JOIN ${t}.services s ON s.id = aps.service_id
  `);
  const summary = summaryRows[0];

  // 2. Gráfico diario
  const [dailyRows] = await db.query<DailyRow[]>(`
    SELECT
      DATE_FORMAT(a.start_at, '%Y-%m-%d') AS label,
      COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled','no_show') THEN s.price_cents ELSE 0 END), 0) / 100 AS ingresos,
      COUNT(CASE WHEN a.status NOT IN ('cancelled','no_show') THEN 1 END) AS citas,
      COUNT(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 END) AS cancelaciones
    FROM ${t}.appointments a
    LEFT JOIN ${t}.appointment_services aps ON a.id = aps.appointment_id
    LEFT JOIN ${t}.services s ON s.id = aps.service_id
    GROUP BY label
    ORDER BY label ASC
  `);

  // 3. Clientes totales y recurrentes
  const [customerRows] = await db.query<CustomerStatsRow[]>(`
    SELECT
      COUNT(*) AS totalCustomers,
      SUM(CASE WHEN apt_count > 1 THEN 1 ELSE 0 END) AS recurringCustomers
    FROM (
      SELECT c.id, COUNT(a.id) AS apt_count
      FROM ${t}.customers c
      LEFT JOIN ${t}.appointments a ON a.customer_id = c.id
      GROUP BY c.id
    ) sub
  `);
  const customerStats = customerRows[0];
  const totalCustomers = Number(customerStats?.totalCustomers ?? 0);
  const recurringCustomers = Number(customerStats?.recurringCustomers ?? 0);

  // 4. Inventario
  const [invSummaryRows] = await db.query<InventorySummaryRow[]>(`
    SELECT
      COALESCE(SUM(price_cents * stock_quantity), 0) / 100 AS totalValue,
      COUNT(CASE WHEN stock_quantity < 10 THEN 1 END) AS lowStockCount
    FROM ${t}.products
    WHERE is_active = 1
  `);
  const invSummary = invSummaryRows[0];

  const [invTopRows] = await db.query<InventoryTopRow[]>(`
    SELECT
      name AS nombre,
      stock_quantity AS stock,
      (price_cents * stock_quantity) / 100 AS valor
    FROM ${t}.products
    WHERE is_active = 1
    ORDER BY stock_quantity DESC
    LIMIT 5
  `);

  // 5. Ranking de staff
  const [staffRankingRows] = await db.query<StaffRankingRow[]>(`
    SELECT
      CONCAT(st.first_name, ' ', st.last_name) AS nombre,
      COUNT(a.id) AS citas,
      COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled','no_show') THEN s.price_cents ELSE 0 END), 0) / 100 AS ingresos
    FROM ${t}.staff st
    LEFT JOIN ${t}.appointment_services aps ON aps.staff_id = st.id
    LEFT JOIN ${t}.appointments a ON a.id = aps.appointment_id
    LEFT JOIN ${t}.services s ON s.id = aps.service_id
    WHERE st.deleted_at IS NULL
    GROUP BY st.id, st.first_name, st.last_name
    ORDER BY ingresos DESC
  `);

  return {
    summary: {
      totalIngresos: Number(summary?.totalIngresos ?? 0),
      totalCitas: Number(summary?.totalCitas ?? 0),
      totalCustomers,
      recurringPct:
        totalCustomers > 0 ? Math.round((recurringCustomers / totalCustomers) * 100) : 0,
      inventoryValue: Number(invSummary?.totalValue ?? 0),
      lowStockItems: Number(invSummary?.lowStockCount ?? 0),
    },
    charts: {
      daily: dailyRows.map((r) => ({
        label: r.label,
        ingresos: Number(r.ingresos),
        citas: Number(r.citas),
        cancelaciones: Number(r.cancelaciones),
      })),
    },
    rankings: {
      staff: staffRankingRows.map((r) => ({
        nombre: r.nombre,
        citas: Number(r.citas),
        ingresos: Number(r.ingresos),
        avatar: String(r.nombre || '')
          .substring(0, 2)
          .toUpperCase(),
      })),
      inventory: invTopRows.map((r) => ({
        nombre: r.nombre,
        stock: Number(r.stock),
        valor: Number(r.valor),
      })),
    },
  };
}
