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

const data = [
  { name: '08:00', value: 120 },
  { name: '10:00', value: 300 },
  { name: '12:00', value: 450 },
  { name: '14:00', value: 400 },
  { name: '16:00', value: 600 },
  { name: '18:00', value: 800 },
  { name: '20:00', value: 500 },
]

const barData = [
  { name: 'P2P', value: 400 },
  { name: '2-Kaki', value: 300 },
  { name: '3-Kaki', value: 200 },
]

export const RevenueChart = ({ data: externalData }: { data?: any[] }) => (
  <div className="h-[300px] w-full mt-4">
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <AreaChart data={externalData || data}>
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

export const OrderDistributionChart = ({ data: externalData }: { data?: any[] }) => (
  <div className="h-[300px] w-full mt-4">
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={externalData || barData}>
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
          {(externalData || barData).map((_, index) => (
            <Cell key={`cell-${index}`} fill={index === 0 ? '#006437' : index === 1 ? '#22C55E' : '#10b981'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
)
