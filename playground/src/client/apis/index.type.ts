export type GetApiHealthResponse = { status: string; uptimeMs: number };
export type GetApiServerResponse = { port: number };
export type GetApiInspectResponse = { method: string; path: string; query: { query?: undefined | string } };
export type GetApiInspectQueryQuery = undefined | string;
export type GetApiEchochannelResponse = { channel: undefined | string; method: string; pretty: false | true; limit: number; query: { pretty?: undefined | string; limit?: undefined | string } };
export type GetApiEchochannelQueryPretty = undefined | string;
export type GetApiEchochannelQueryLimit = undefined | string;
export type PostApiEchochannelResponse = { channel: undefined | string; method: string; pretty: false | true; limit: number; query: { pretty?: undefined | string; limit?: undefined | string } } & { body: { message: string; tags?: undefined | string[]; metadata?: undefined | { [key: string]: string } } };
export type PostApiEchochannelQueryPretty = undefined | string;
export type PostApiEchochannelQueryLimit = undefined | string;

export interface PostApiEchochannelBody {
  message: string;
  tags?: undefined | string[];
  metadata?: undefined | { [key: string]: string };
}
export interface GetApiInspectQuery {
  query?: GetApiInspectQueryQuery;
}
export interface GetApiEchochannelPath {
  channel: string;
}
export interface GetApiEchochannelQuery {
  pretty?: GetApiEchochannelQueryPretty;
  limit?: GetApiEchochannelQueryLimit;
}
export interface PostApiEchochannelPath {
  channel: string;
}
export interface PostApiEchochannelQuery {
  pretty?: PostApiEchochannelQueryPretty;
  limit?: PostApiEchochannelQueryLimit;
}
