import React from 'react';
import { DimensionValue, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';

export interface DataPoint {
  /** Date or label for the data point */
  label: string;
  /** Numeric value */
  value: number;
  /** Optional unit */
  unit?: string;
}

export interface GrowthChartProps {
  /** Title of the chart */
  title: string;
  /** Array of data points */
  data: DataPoint[];
  /** Unit to display */
  unit?: string;
  /** Minimum value for the Y-axis (auto-calculated if not provided) */
  minValue?: number;
  /** Maximum value for the Y-axis (auto-calculated if not provided) */
  maxValue?: number;
  /** Color of the chart line/bars */
  color?: string;
  /** Show grid lines */
  showGrid?: boolean;
  /** Chart type: 'line' or 'bar' */
  type?: 'line' | 'bar';
}

export function GrowthChart({
  title,
  data,
  unit,
  minValue,
  maxValue,
  color,
  showGrid = true,
  type = 'line',
}: GrowthChartProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const isDark = settings.isDarkTheme;

  if (!data || data.length === 0) {
    return null;
  }

  const defaultColor = color || '#0a7ea4';
  const chartHeight = getScaledFontSize(200);
  const chartPadding = getScaledFontSize(20);
  // Set minimum width to ensure scrolling when needed (80px per data point minimum)
  const minChartWidth = Math.max(300, data.length * getScaledFontSize(80));

  // Calculate min and max values
  const values = data.map((d) => d.value);
  const calculatedMin = minValue !== undefined ? minValue : Math.min(...values);
  const calculatedMax = maxValue !== undefined ? maxValue : Math.max(...values);
  const range = calculatedMax - calculatedMin || 1; // Avoid division by zero

  // Calculate Y positions for each data point
  const getYPosition = (value: number) => {
    const normalizedValue = (value - calculatedMin) / range;
    return chartHeight - chartPadding - normalizedValue * (chartHeight - chartPadding * 2);
  };

  // Generate grid lines
  const gridLines = showGrid ? 5 : 0;
  const gridValues: number[] = [];
  if (showGrid && gridLines > 0) {
    for (let i = 0; i <= gridLines; i++) {
      gridValues.push(calculatedMin + (range * i) / gridLines);
    }
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#252525' : '#f9f9f9',
          borderRadius: 16,
          padding: getScaledFontSize(16),
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          {
            color: isDark ? '#ECEDEE' : '#11181C',
            fontSize: getScaledFontSize(18),
            fontWeight: getScaledFontWeight(700) as any,
            marginBottom: getScaledFontSize(16),
          },
        ]}
      >
        {title}
      </Text>

      <View style={[styles.chartContainer, { height: chartHeight }]}>
        {/* Grid lines */}
        {showGrid &&
          gridValues.map((value, index) => {
            const yPos = getYPosition(value);
            return (
              <View
                key={`grid-${index}`}
                style={[
                  styles.gridLine,
                  {
                    top: yPos,
                    backgroundColor: isDark ? '#3a3a3a' : '#e0e0e0',
                    left: showGrid ? getScaledFontSize(40) : 0,
                  },
                ]}
              />
            );
          })}

        {/* Y-axis labels */}
        {showGrid && (
          <View style={styles.yAxisLabels}>
            {gridValues.map((value, index) => {
              const yPos = getYPosition(value);
              return (
                <Text
                  key={`label-${index}`}
                  style={[
                    styles.yAxisLabel,
                    {
                      color: isDark ? '#9BA1A6' : '#687076',
                      fontSize: getScaledFontSize(10),
                      fontWeight: getScaledFontWeight(400) as any,
                      top: yPos - getScaledFontSize(8),
                    },
                  ]}
                >
                  {value.toFixed(1)}
                  {unit}
                </Text>
              );
            })}
          </View>
        )}

        {/* Scrollable Chart content */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingLeft: showGrid ? getScaledFontSize(40) : 0,
              minWidth: minChartWidth,
            },
          ]}
          style={styles.scrollView}
        >
          <View style={[styles.chart, { width: minChartWidth }]}>
            {type === 'line' ? (
              // Line chart
              <>
                {/* Draw lines */}
                {data.map((point, index) => {
                  if (index === 0) return null;
                  const prevPoint = data[index - 1];
                  const x1 = `${((index - 1) / (data.length - 1)) * 100}%`;
                  const x2 = `${(index / (data.length - 1)) * 100}%`;
                  const y1 = getYPosition(prevPoint.value);
                  const y2 = getYPosition(point.value);

                  // Calculate line length and angle
                  const length = Math.sqrt(Math.pow(100 / (data.length - 1), 2) + Math.pow(y2 - y1, 2));
                  const angle = Math.atan2(y2 - y1, 100 / (data.length - 1)) * (180 / Math.PI);

                  return (
                    <View
                      key={`line-${index}`}
                      style={[
                        styles.line,
                        {
                          left: x1 as DimensionValue,
                          top: y1,
                          width: length,
                          backgroundColor: defaultColor,
                          transform: [{ rotate: `${angle}deg` }],
                        },
                      ]}
                    />
                  );
                })}

                {/* Draw points */}
                {data.map((point, index) => {
                  const x = `${(index / (data.length - 1)) * 100}%`;
                  const y = getYPosition(point.value);
                  return (
                    <View
                      key={`point-${index}`}
                      style={[
                        styles.point,
                        {
                          left: x as DimensionValue,
                          top: y - getScaledFontSize(6),
                          backgroundColor: defaultColor,
                          width: getScaledFontSize(12),
                          height: getScaledFontSize(12),
                          borderRadius: getScaledFontSize(6),
                        },
                      ]}
                    />
                  );
                })}
              </>
            ) : (
              // Bar chart
              data.map((point, index) => {
                const barWidth = 100 / data.length - 2;
                const barHeight = chartHeight - chartPadding - getYPosition(point.value);
                const x = (index / data.length) * 100 + 1;

                return (
                  <View
                    key={`bar-${index}`}
                    style={[
                      styles.bar,
                      {
                        left: `${x}%`,
                        bottom: chartPadding,
                        width: `${barWidth}%`,
                        height: barHeight,
                        backgroundColor: defaultColor,
                        borderRadius: getScaledFontSize(4),
                      },
                    ]}
                  />
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

      {/* X-axis labels */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.xAxisLabelsScrollContent,
          { minWidth: minChartWidth },
        ]}
        style={styles.xAxisScrollView}
      >
        {data.map((point, index) => (
          <Text
            key={`xlabel-${index}`}
            style={[
              styles.xAxisLabel,
              {
                color: isDark ? '#9BA1A6' : '#687076',
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(400) as any,
                width: `${100 / data.length}%`,
                textAlign: 'center',
              },
            ]}
          >
            {point.label}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    marginBottom: 16,
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    minHeight: '100%',
    minWidth: '100%',
  },
  chart: {
    position: 'relative',
    height: '100%',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  yAxisLabels: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  yAxisLabel: {
    position: 'absolute',
    right: 4,
  },
  line: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  point: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
  },
  bar: {
    position: 'absolute',
  },
  xAxisScrollView: {
    marginTop: 8,
  },
  xAxisLabelsScrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  xAxisLabel: {
    textAlign: 'center',
  },
});

