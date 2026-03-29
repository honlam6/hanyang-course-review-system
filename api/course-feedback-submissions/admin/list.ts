import feedbackHandler from "../[...path].js";

export default async function handler(req: any, res: any) {
  req.query = {
    ...(req.query || {}),
    path: ["admin", "list"],
  };

  return feedbackHandler(req, res);
}
