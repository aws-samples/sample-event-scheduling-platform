import * as React from "react";
import BarChart from "@cloudscape-design/components/bar-chart";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { Container, Header } from "@cloudscape-design/components";

interface Event {
    id: string;
    name: string;
    event_starts_ts: string;
    event_ends_ts: string;
    event_status: string;
}

interface HomeBarChartProps {
    events: Event[];
}

const HomeBarChart: React.FC<HomeBarChartProps> = ({ events }) => {
    const monthlyData = events.reduce((acc, event) => {
        const date = new Date(event.event_starts_ts);
        const monthYear = `${date.getFullYear()}-${date.getMonth() + 1}`;
        acc[monthYear] = (acc[monthYear] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const nextMonthKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth() + 1}`;

    // Ensure current and next month are included
    monthlyData[currentMonth] = monthlyData[currentMonth] || 0;
    monthlyData[nextMonthKey] = monthlyData[nextMonthKey] || 0;

    const sortedMonths = Object.keys(monthlyData).sort();

    const successData = sortedMonths.map(month => ({
        x: new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1),
        y: Number(monthlyData[month])
    }));

    const failData = sortedMonths.map(month => ({
        x: new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1),
        y: 0
    }));

    const maxY = Math.max(...Object.values(monthlyData), 10);

    return (
        <Container header={<Header variant="h2">Success Rate ✅</Header>}>
            <BarChart
                series={[
                    {
                        title: "Success",
                        type: "bar",
                        data: successData
                    },
                    {
                        title: "Fail",
                        type: "bar",
                        data: failData
                    },
                ]}
                xDomain={successData.map(item => item.x)}
                yDomain={[0, maxY]}
                i18nStrings={{
                    xTickFormatter: e =>
                        e.toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric"
                        })
                }}
                ariaLabel="Monthly event count chart"
                height={60}
                hideFilter
                stackedBars
                xTitle="Month"
                yTitle="Events count"
                empty={
                    <Box textAlign="center" color="inherit">
                        <b>No data available</b>
                        <Box variant="p" color="inherit">
                            There is no data available
                        </Box>
                    </Box>
                }
                noMatch={
                    <Box textAlign="center" color="inherit">
                        <b>No matching data</b>
                        <Box variant="p" color="inherit">
                            There is no matching data to display
                        </Box>
                        <Button>Clear filter</Button>
                    </Box>
                }
            />
        </Container>
    );
}

export default HomeBarChart;