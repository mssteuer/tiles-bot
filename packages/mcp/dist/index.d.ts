#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export declare const serverVersion = "0.3.0";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare const tools: any[];
export declare function createTilesBotServer(): Server<{
    method: string;
    params?: {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            progressToken?: string | number | undefined;
            "io.modelcontextprotocol/related-task"?: {
                taskId: string;
            } | undefined;
        } | undefined;
    } | undefined;
}, {
    method: string;
    params?: {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            progressToken?: string | number | undefined;
            "io.modelcontextprotocol/related-task"?: {
                taskId: string;
            } | undefined;
        } | undefined;
    } | undefined;
}, {
    [x: string]: unknown;
    _meta?: {
        [x: string]: unknown;
        progressToken?: string | number | undefined;
        "io.modelcontextprotocol/related-task"?: {
            taskId: string;
        } | undefined;
    } | undefined;
}>;
export declare function callTool(name: string, args?: any, fetchImpl?: FetchLike): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
export {};
