import {resourceMetadata} from '../../lib/mcp/auth';
export function GET(){return Response.json(resourceMetadata(),{headers:{'Cache-Control':'public, max-age=300'}});}
