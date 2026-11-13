import { analyticsHandler } from '../analytics/handler.mjs';
export default function handler(req,res){const url=new URL(req.url,'https://localhost');if(!url.searchParams.has('action'))url.searchParams.set('action','collect');req.url=url.pathname+url.search;return analyticsHandler(req,res);}
