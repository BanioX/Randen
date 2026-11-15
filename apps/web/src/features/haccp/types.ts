import type { OperationOutput } from '@randen/core';

/** Rows of the queries of «Selbstkontrolle», as the contract types them. */
export type TodayView = OperationOutput<'haccp.today'>;
export type TodayArea = TodayView['areas'][number];
export type TodayTask = TodayView['tasks'][number];
export type TemperatureRow = TodayView['food'][number];
export type ListView = OperationOutput<'temperatures.list'>;
export type LogRow = ListView['logs'][number];
export type SeriesRow = ListView['series'][number];
export type ProposalRow = ListView['proposals'][number];
export type AreaOption = ListView['areas'][number];
export type HygieneTaskRow = OperationOutput<'hygiene.tasks'>['tasks'][number];
export type ReportView = OperationOutput<'haccp.report'>;
