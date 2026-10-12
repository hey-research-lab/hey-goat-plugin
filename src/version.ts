/** Kept equal to package.json's version by a test. */
export const PLUGIN_VERSION = '0.1.0';
/** Sent as `x-hey-integration` and named first in the user-agent, so HEY counts this plugin as itself. */
export const INTEGRATION = `hey-goat-plugin/${PLUGIN_VERSION}`;
