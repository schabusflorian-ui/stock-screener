import api from "./api";
export const attributionAPI = { getRegime: () => api.get("/attribution/regime") };
