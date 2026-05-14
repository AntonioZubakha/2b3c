import api from "./index";

export type ParserAliasesMap = Record<string, string[]>;

export interface ParserAliasesSettingsResponse {
  scope: "global";
  aliases: ParserAliasesMap;
  updatedBy?: { _id: string; firstName: string; lastName: string; email: string };
  updatedAt: string;
  reason: string;
  createdAt: string;
}

export interface UpdateParserAliasesSettingsRequest {
  aliases: ParserAliasesMap;
  reason: string;
}

export const getParserAliasesSettings = () =>
  api
    .get<ParserAliasesSettingsResponse>("/admin/parser-aliases-settings")
    .then(({ data }) => data);

export const updateParserAliasesSettings = (
  data: UpdateParserAliasesSettingsRequest,
) =>
  api
    .put<ParserAliasesSettingsResponse>("/admin/parser-aliases-settings", data)
    .then(({ data }) => data);
