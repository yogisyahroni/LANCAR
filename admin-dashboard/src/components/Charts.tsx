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
  <div className="mt-4 flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-sm text-zinc-500">
    {label}
  </div>
)

export const RevenueChart = ({ data: externalData }: { data?: unknown[] }) => {
  const chartData = normalizeChartData(externalData)

  if (chartData.length === 0) {
    return <EmptyChartState label="Belum ada data revenue dari API." />
  }

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `Rp${value >= 1000 ? (value/1000).toFixed(1) + 'm' : value + 'k'}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #ffffff10',
              borderRadius: '12px',
              color: '#fff'
            }}
            itemStyle={{ color: '#22C55E' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#22C55E"
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
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: '#ffffff05' }}
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #ffffff10',
              borderRadius: '12px',
              color: '#fff'
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? '#006437' : index === 1 ? '#22C55E' : '#10b981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
