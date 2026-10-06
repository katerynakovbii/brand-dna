import { put, head } from '@vercel/blob';
import { handleShare } from '../server/share.mjs';

const deps = { put, head, fetchImpl: (...a) => fetch(...a) };

export const POST = (request) => handleShare(request, deps);
export const GET = (request) => handleShare(request, deps);
