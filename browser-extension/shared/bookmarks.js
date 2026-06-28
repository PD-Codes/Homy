/** Flatten Chrome bookmark tree to link nodes. */

export async function flattenBrowserBookmarks() {
    if (!chrome.bookmarks?.getTree) return [];
    const tree = await chrome.bookmarks.getTree();
    const out = [];
    const walk = (nodes, path = '') => {
        for (const node of nodes) {
            const folder = path ? `${path} / ${node.title}` : node.title;
            if (node.url) {
                out.push({
                    id: node.id,
                    title: node.title || node.url,
                    url: node.url,
                    folder,
                });
            }
            if (node.children?.length) walk(node.children, node.url ? path : folder);
        }
    };
    walk(tree);
    return out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
