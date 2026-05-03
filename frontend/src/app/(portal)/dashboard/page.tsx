'use client';

import { motion } from 'framer-motion';
import { Package, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const stats = [
    { title: 'Total Shipments', value: '1,284', icon: Package, trend: '+12.5%' },
    { title: 'Active Deliveries', value: '45', icon: TrendingUp, trend: '+4.2%' },
    { title: 'Avg. Delivery Time', value: '1.2 Days', icon: Clock, trend: '-8.1%' },
    { title: 'Issues/Disputes', value: '3', icon: AlertCircle, trend: '-2.0%', isNegative: true },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome, {user?.name || 'Customer'}
        </h1>
        <p className="text-muted-foreground mt-2">
          Here is an overview of your logistics performance.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                <h3 className="text-2xl font-bold text-foreground mt-2">{stat.value}</h3>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-4">
              <span className={`text-sm font-medium ${stat.isNegative ? 'text-destructive' : 'text-emerald-500'}`}>
                {stat.trend}
              </span>
              <span className="text-sm text-muted-foreground ml-2">vs last month</span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-6 shadow-sm min-h-[400px]"
      >
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-4">Recent Activity</h2>
        <div className="flex items-center justify-center h-[300px] text-muted-foreground border-2 border-dashed border-border/40 rounded-xl">
          Chart Placeholder - To be implemented
        </div>
      </motion.div>
    </div>
  );
}
