export function isUnnamedTile(tile) {
  return !tile?.name || /^Tile #\d+$/.test(tile.name);
}
