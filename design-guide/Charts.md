# Charts

_Updated: June 10, 2024 - Added guidance on using trend lines, choosing a chart type, and including a legend._

A chart is a visual representation of data that can help people understand and analyze information, identify trends, and make comparisons.

The system provides a range of chart types that you can use to visualize data within your app. Using system-provided chart types offers people a familiar experience because these charts also appear in system apps like Health and Stocks. For developer guidance, see [Swift Charts](https://developer.apple.com/documentation/charts).

## Anatomy

A chart consists of _marks_ that represent the data values, and _axes_ that provide the context in which to read the marks.

- A **mark** is a visual representation of a data point, such as a bar in a bar chart, a point in a line chart, a wedge in a pie chart, or a box in a box plot. Different chart types use different marks to display data.
- An **axis** provides the frame of reference for the chart's data. Most charts have two axes: an x-axis, which is usually horizontal, and a y-axis, which is usually vertical. The exception is a pie or donut chart, which has an angular axis and a radial axis. In most charts, one axis represents a categorical value and the other represents a numeric value.

A chart can also include descriptive elements like titles, labels, and a legend.

## Best practices

**Make sure your chart is easy to understand.** If people have to spend a lot of time deciphering your chart, they're likely to get frustrated and may miss its meaning.

To help you design a chart that effectively communicates its information, consider the following fundamental goals:

- **Choose a chart that best represents the data.** For guidance, see [Chart types](/design/human-interface-guidelines/charts#Chart-types).
- **Use color, shapes, and other visual attributes to help people interpret the data.** For example, use contrasting colors to help people distinguish between different categories, and use a consistent shape for marks that are in the same category.
- **Provide context for the data.** For example, display a title that summarizes the chart's purpose, and label the axes so people know what the values represent.

**Make your charts accessible.** Not everyone can perceive a chart's visual attributes, such as its colors and shapes, so it's essential to provide textual descriptions of the data. For developer guidance, see [Representing data in an accessible way](https://developer.apple.com/documentation/charts/representing-data-in-an-accessible-way).

**In a long-press gesture, display details about a specific data point.** For example, when people press and hold a bar in a bar chart, you can display a view that contains the bar's specific value and other relevant information.

## Chart types

The system provides several different types of charts you can use to display your data.

- **Bar chart.** A bar chart uses rectangular marks to compare two or more items or to show how a value changes over time. It can display a large number of data points, including negative values.
- **Line chart.** A line chart shows how a value changes over a continuous interval, such as time. It's especially useful for displaying a large number of data points. A line chart can also display a trend line, which is a line that indicates the general pattern or direction of the data.
- **Area chart.** An area chart is a line chart where the area between the line and the axis is filled with a color or a gradient. You can use an area chart to show how a value changes over time, and to emphasize the magnitude of the change.
- **Rule chart.** A rule chart is a line or bar that spans a chart's plot area and represents a single value. You can use a rule chart to highlight a threshold, a goal, or a statistical value like the mean, median, or mode.
- **Point chart.** A point chart — also known as a scatter plot — uses individual marks to display the relationship between two or more sets of numeric values. A point chart is useful for showing clusters or outliers in the data.
- **Rectangle chart.** A rectangle chart uses rectangular marks of different sizes to display hierarchical data. The marks in a rectangle chart — also known as a treemap — are packed together to fill the chart's plot area.
- **Pie and donut charts.** A pie chart and the similar donut chart are circular charts that are divided into wedges that each represent a portion of the whole. These charts are best for displaying a small number of categories that have a part-to-whole relationship.

### Choosing a chart type

To choose a chart that's best for visualizing a particular type of data, it can be helpful to consider what you want the chart to communicate.

If you want to:

- **Compare values**, a bar chart often works well. A line chart can also work, especially if you want to show how the comparison changes over time.
- **Show the composition of a value**, a pie or donut chart can be a good choice. A rectangle chart can also work, especially if the composition is hierarchical.
- **Show the distribution of values**, consider a point chart or a histogram (which is a specific type of bar chart).
- **Show a relationship between values**, a point chart is a common choice. A line chart can also work well, especially if the relationship changes over time.

## Axes

The system automatically generates a chart's axes based on your data. By default, most charts have an x-axis and a y-axis. The y-axis automatically displays 6 grid lines, but you can configure it to display between 2 and 10 grid lines.

**Customize axis labels to help people understand the data.** By default, the system generates labels that are based on the data, but you can provide custom labels to add context.

## Legend

A legend is a list of the categories in a chart and the visual attributes that represent them. A legend can help people interpret a chart, but it's not always necessary.

**Consider hiding the legend if the chart is simple enough to be self-explanatory.** For example, if a chart has only one series of data, you might not need a legend.

## Color

**Use distinct colors to help people differentiate between the categories in a chart.** Avoid using colors that are too similar, because people might not be able to tell them apart. When possible, use the same colors for the same categories across all the charts in your app.

**In a chart that has a lot of data, consider using a gradient to represent the values.** A gradient can help people understand the range of values in the chart, and it can also make the chart more visually appealing.

## Platform considerations

_No additional considerations for iOS, iPadOS, tvOS, visionOS, or watchOS._

### macOS

In a Mac app, you can use the same chart types that are available in iOS and iPadOS.

## Resources

#### Developer documentation

[Swift Charts](https://developer.apple.com/documentation/charts)
[Creating a chart using Swift Charts](https://developer.apple.com/documentation/charts/creating-a-chart-using-swift-charts)

#### Videos

[Design charts with Swift Charts](https://developer.apple.com/videos/play/wwdc2024/10183)
[Hello Swift Charts](https://developer.apple.com/videos/play/wwdc2022/10136)

## Change log

| Date          | Changes                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| June 10, 2024 | Added guidance on using trend lines, choosing a chart type, and including a legend. |

---

_Source: [Apple Human Interface Guidelines - Charts](https://developer.apple.com/design/human-interface-guidelines/charts)_
