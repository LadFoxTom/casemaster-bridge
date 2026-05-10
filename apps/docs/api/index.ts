/**
 * Vercel function entry. Hands every request to cms-vercel, which parses
 * the .cms files in ./app and renders them.
 */
import { createHandler } from 'cms-vercel';

export default createHandler();
