"use client";

import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info } from "lucide-react";

// ── Chart colors ──

const COLORS = [
  "#c78d4e", // warm gold
  "#6aad96", // sage green
  "#d47e7e", // soft coral
  "#7698c9", // muted blue
  "#c9a76a", // amber
  "#8b7ec9", // lavender
  "#5ba3a3", // teal
  "#d4a07e", // peach
];

// ── Chart Block ──

interface ChartData {
  type: "bar" | "line" | "area" | "pie";
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  unit?: string;
}

function parseChartJson(raw: string): ChartData | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.data || !Array.isArray(parsed.data)) return null;
    return {
      type: parsed.type || "bar",
      title: parsed.title,
      data: parsed.data,
      xKey: parsed.xKey || parsed.x || "name",
      yKeys: parsed.yKeys || parsed.y || (parsed.yKey ? [parsed.yKey] : undefined),
      unit: parsed.unit,
    };
  } catch {
    return null;
  }
}

function inferYKeys(data: Record<string, unknown>[], xKey: string): string[] {
  if (!data[0]) return [];
  return Object.keys(data[0]).filter(
    (k) => k !== xKey && typeof data[0][k] === "number"
  );
}

function ChartBlock({ json }: { json: string }) {
  const chart = useMemo(() => parseChartJson(json), [json]);
  if (!chart) return <CodeFallback code={json} language="json" />;

  const { type, title, data, xKey = "name", unit } = chart;
  const yKeys = chart.yKeys?.length ? chart.yKeys : inferYKeys(data, xKey);

  if (yKeys.length === 0) return <CodeFallback code={json} language="json" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any) => {
    const v = typeof value === "number" ? value : Number(value);
    return unit ? `${v.toLocaleString("fr-FR")} ${unit}` : v.toLocaleString("fr-FR");
  };

  const commonProps = {
    data,
    margin: { top: 8, right: 16, left: 8, bottom: 4 },
  };

  const axisProps = {
    xAxis: (
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        axisLine={{ stroke: "hsl(var(--border))" }}
        tickLine={false}
      />
    ),
    yAxis: (
      <YAxis
        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v: number) => (unit ? `${v}${unit}` : `${v}`)}
        width={50}
      />
    ),
    grid: <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />,
    tooltip: (
      <Tooltip
        formatter={tooltipFormatter}
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          fontSize: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
      />
    ),
    legend: yKeys.length > 1 ? (
      <Legend
        wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
      />
    ) : null,
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return (
          <LineChart {...commonProps}>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart {...commonProps}>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        );

      case "pie":
        return (
          <PieChart>
            {axisProps.tooltip}
            <Pie
              data={data}
              dataKey={yKeys[0]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={40}
              paddingAngle={2}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={({ name, percent }: any) =>
                `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            {axisProps.legend}
          </PieChart>
        );

      default: // bar
        return (
          <BarChart {...commonProps}>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="my-4 rounded-xl border border-border bg-secondary/20 p-4"
    >
      {title && (
        <h4 className="text-sm font-semibold text-foreground mb-3">{title}</h4>
      )}
      <ResponsiveContainer width="100%" height={260}>
        {renderChart()}
      </ResponsiveContainer>
    </motion.div>
  );
}

// ── KPI Block ──

interface KpiMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "stable";
  description?: string;
}

function parseKpiJson(raw: string): KpiMetric[] | null {
  try {
    const parsed = JSON.parse(raw);
    const metrics = parsed.metrics || parsed;
    if (!Array.isArray(metrics)) return null;
    return metrics;
  } catch {
    return null;
  }
}

function KpiBlock({ json }: { json: string }) {
  const metrics = useMemo(() => parseKpiJson(json), [json]);
  if (!metrics) return <CodeFallback code={json} language="json" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="my-4 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))` }}
    >
      {metrics.map((m, i) => {
        const TrendIcon =
          m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
        const trendColor =
          m.trend === "up"
            ? "text-emerald-500"
            : m.trend === "down"
            ? "text-red-400"
            : "text-muted-foreground";

        return (
          <div
            key={i}
            className="rounded-xl border border-border bg-secondary/20 p-3.5 flex flex-col gap-1"
          >
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {m.label}
            </span>
            <span className="text-xl font-bold text-foreground">{m.value}</span>
            {(m.change || m.trend) && (
              <div className={cn("flex items-center gap-1 text-xs", trendColor)}>
                <TrendIcon className="w-3 h-3" />
                {m.change && <span>{m.change}</span>}
              </div>
            )}
            {m.description && (
              <span className="text-xs text-muted-foreground mt-0.5">{m.description}</span>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}

// ── Callout Block ──

interface CalloutData {
  type?: "info" | "warning" | "recommendation";
  title?: string;
  content: string;
}

function parseCalloutJson(raw: string): CalloutData | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.content) return null;
    return parsed;
  } catch {
    return null;
  }
}

function CalloutBlock({ json }: { json: string }) {
  const callout = useMemo(() => parseCalloutJson(json), [json]);
  if (!callout) return <CodeFallback code={json} language="json" />;

  const isWarning = callout.type === "warning";
  const Icon = isWarning ? AlertTriangle : Info;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "my-3 rounded-lg border-l-4 px-4 py-3",
        isWarning
          ? "border-l-amber-500 bg-amber-500/5"
          : callout.type === "recommendation"
          ? "border-l-emerald-500 bg-emerald-500/5"
          : "border-l-blue-500 bg-blue-500/5"
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "w-4 h-4 mt-0.5 flex-shrink-0",
            isWarning ? "text-amber-500" : callout.type === "recommendation" ? "text-emerald-500" : "text-blue-500"
          )}
        />
        <div className="min-w-0">
          {callout.title && (
            <p className="text-sm font-semibold text-foreground mb-1">{callout.title}</p>
          )}
          <p className="text-sm text-foreground/80 leading-relaxed">{callout.content}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Code Fallback ──

function CodeFallback({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-3 rounded-lg bg-secondary/40 border border-border overflow-x-auto">
      {language && (
        <div className="px-3 py-1.5 border-b border-border bg-secondary/60 text-xs font-mono text-muted-foreground uppercase">
          {language}
        </div>
      )}
      <pre className="p-3 text-xs font-mono text-foreground/90 whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Styled Table ──

function StyledTable({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="my-4 rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

function StyledThead({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className="bg-secondary/60" {...props}>
      {children}
    </thead>
  );
}

function StyledTh({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-foreground/80 uppercase tracking-wider border-b border-border"
      {...props}
    >
      {children}
    </th>
  );
}

function StyledTd({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className="px-3 py-2 text-sm text-foreground/90 border-b border-border/50"
      {...props}
    >
      {children}
    </td>
  );
}

function StyledTr({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className="hover:bg-secondary/30 transition-colors" {...props}>
      {children}
    </tr>
  );
}

// ── Custom Code Handler ──

function CodeHandler({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match?.[1];
  const code = String(children).replace(/\n$/, "");

  // Rich blocks
  if (language === "chart") return <ChartBlock json={code} />;
  if (language === "kpi") return <KpiBlock json={code} />;
  if (language === "callout") return <CalloutBlock json={code} />;

  // Regular code block (has language class = is inside <pre>)
  if (language) return <CodeFallback code={code} language={language} />;

  // Inline code
  return (
    <code
      className="px-1.5 py-0.5 rounded-md bg-secondary/60 text-[13px] font-mono text-foreground/90"
      {...props}
    >
      {children}
    </code>
  );
}

// ── Custom Pre Handler ──

function PreHandler({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  // If children is already a rich block (ChartBlock, KpiBlock, etc.), don't wrap in <pre>
  if (React.isValidElement(children)) {
    const childType = (children as React.ReactElement<{ className?: string }>).props?.className;
    if (childType && /language-(chart|kpi|callout)/.test(childType)) {
      return <>{React.cloneElement(children as React.ReactElement)}</>;
    }
    // For regular code blocks with language, CodeHandler already renders CodeFallback
    // Just pass through without wrapping in <pre>
    return <>{children}</>;
  }
  return <pre {...props}>{children}</pre>;
}

// ── Custom Link ──

function StyledLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
      {...props}
    >
      {children}
    </a>
  );
}

// ── Custom Blockquote ──

function StyledBlockquote({
  children,
  ...props
}: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote
      className="border-l-3 border-primary/40 pl-4 py-1 my-3 text-foreground/80 italic"
      {...props}
    >
      {children}
    </blockquote>
  );
}

// ── Paragraph handler — detects bare inline JSON chart blobs ──

function PHandler({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  // Collect all text content from children
  const text = React.Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();

  if (text.startsWith("{") && text.endsWith("}")) {
    const chart = parseChartJson(text);
    if (chart) return <ChartBlock json={text} />;
    const kpi = parseKpiJson(text);
    if (kpi) return <KpiBlock json={text} />;
    const callout = parseCalloutJson(text);
    if (callout) return <CalloutBlock json={text} />;
  }

  return <p className="mb-3 leading-7" {...props}>{children}</p>;
}

// ── Export components map ──

export const markdownComponents: Components = {
  code: CodeHandler as Components["code"],
  pre: PreHandler as Components["pre"],
  table: StyledTable as Components["table"],
  thead: StyledThead as Components["thead"],
  th: StyledTh as Components["th"],
  td: StyledTd as Components["td"],
  tr: StyledTr as Components["tr"],
  a: StyledLink as Components["a"],
  blockquote: StyledBlockquote as Components["blockquote"],
  p: PHandler as Components["p"],
};
