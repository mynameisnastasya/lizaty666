// Сборка ASTRODAY 2.0 для вставки в бандлы Railway: всё в одном IIFE → globalThis.ASTRODAY_V2_RUNTIME.
import * as runtime from "./runtime.mjs";
import * as queue from "./queue.mjs";
globalThis.ASTRODAY_V2_RUNTIME = { ...runtime, queue };
