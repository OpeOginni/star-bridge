/**
 * Escapes special characters for Telegram MarkdownV2 format
 * @param text The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdown(text: string): string {
    // All special characters that need escaping in MarkdownV2
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Formats a number with 2 decimal places and escapes for MarkdownV2
 * @param num The number to format
 * @returns Formatted and escaped string
 */
export function formatNumber(num: number): string {
    return escapeMarkdown(num.toFixed(3));
}

/**
 * Formats an address for MarkdownV2
 * @param address Blockchain address
 * @returns Escaped address string
 */
export function formatAddress(address: string): string {
    return `\`${escapeMarkdown(address)}\``;
}

/**
 * Gets the network indicator for testnet
 * @returns Network indicator string
 */
export function getNetworkIndicator(): string {
    return process.env.TESTNET === "true" ? "🧪 TESTNET" : "";
}
