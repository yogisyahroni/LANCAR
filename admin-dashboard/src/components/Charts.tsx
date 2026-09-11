import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts'

type ChartPoint = {
  name: string
  value: number
}

const normalizeChartData = (data?: unknown[]): ChartPoint[] => {
  if (!Array.isArray(data)) return []

  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return []

    const rawName = (item as { name?: unknown }).name
    const rawValue = (item as { value?: unknown }).value
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)

    if (typeof rawName !== 'string' || !rawName.trim() || !Number.isFinite(value)) {
      return []
    }

    return [{ name: rawName, value }]
  })
}

const EmptyChartState = ({ label }: { label: string }) => (
  <div role="status" aria-live="polite" className="mt-4 flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-surface/[0.02] text-sm text-foreground-muted">
    {label}
  </div>
)

export const RevenueChart = ({ data: externalData }: { data?: unknown[] }) => {
  const chartData = normalizeChartData(externalData)

  if (chartData.length === 0) {
    return <EmptyChartState label="Belum ada data revenue dari API." />
  }

  return (
    <div className="h-[300px] w-full mt-4" role="img" aria-label="Revenue chart" aria-describedby="revenue-chart-summary">
      <p id="revenue-chart-summary" className="sr-only">Revenue by period: {chartData.map((point) => `${point.name}: ${point.value}`).join('; ')}.</p>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--color-foreground-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--color-foreground-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `Rp${value >= 1000 ? (value/1000).toFixed(1) + 'm' : value + 'k'}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              color: 'var(--color-foreground)'
            }}
            itemStyle={{ color: 'var(--color-primary)' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorValue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export const OrderDistributionChart = ({ data: externalData }: { data?: unknown[] }) => {
  const chartData = normalizeChartData(externalData)

  if (chartData.length === 0) {
    return <EmptyChartState label="Belum ada data distribusi order dari API." />
  }

  return (
    <div className="h-[300px] w-full mt-4" role="img" aria-label="Order distribution chart" aria-describedby="order-distribution-chart-summary">
      <p id="order-distribution-chart-summary" className="sr-only">Order distribution: {chartData.map((point) => `${point.name}: ${point.value}`).join('; ')}.</p>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--color-foreground-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--color-foreground-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-subtle)' }}
            contentStyle={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              color: 'var(--color-foreground)'
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--color-primary-light)' : index === 1 ? 'var(--color-primary)' : 'var(--color-success)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
