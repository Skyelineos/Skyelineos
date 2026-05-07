declare module 'react-plotly.js' {
  import { Component } from 'react';
  import { PlotData, Layout, Config } from 'plotly.js';

  interface PlotParams {
    data: PlotData[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: React.CSSProperties;
    className?: string;
    onPlotlyClick?: (data: any) => void;
    onPlotlyHover?: (data: any) => void;
    onPlotlyUnhover?: (data: any) => void;
    [key: string]: any;
  }

  export default class Plot extends Component<PlotParams> {}
}