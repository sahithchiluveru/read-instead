// Fixture CBZs for the Reader-seam tests, as the reader harness serves them: one SVG per
// page, each showing its page number.

const page = (n, { width, height }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#fff"/><text x="50%" y="50%" font-size="${height / 4}">${n}</text></svg>`

// A comic of count pages, by default portrait scans far larger than the screen.
export const comic = (count, size = { width: 1800, height: 2700 }) =>
    ({ pages: Array.from({ length: count }, (_, i) => page(i + 1, size)) })
