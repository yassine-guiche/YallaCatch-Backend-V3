import React, { memo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';

/**
 * Virtualized list component for rendering large datasets efficiently
 * Only renders visible items + a small overscan buffer
 */

// Memoized row renderer to prevent unnecessary re-renders
const MemoizedRow = memo(({ data, index, style }) => {
  const { items, renderItem, itemKey } = data;
  const item = items[index];
  
  if (!item) return null;
  
  return (
    <div style={style} key={itemKey ? itemKey(item, index) : index}>
      {renderItem(item, index)}
    </div>
  );
});

MemoizedRow.displayName = 'MemoizedRow';

/**
 * VirtualizedList - Efficiently renders large lists using windowing
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of items to render
 * @param {Function} props.renderItem - Function to render each item: (item, index) => ReactNode
 * @param {number} props.itemHeight - Height of each item in pixels
 * @param {number} [props.height=400] - Total height of the list container
 * @param {number} [props.width='100%'] - Width of the list container
 * @param {Function} [props.itemKey] - Function to generate unique key for each item
 * @param {number} [props.overscanCount=5] - Number of extra items to render outside visible area
 * @param {string} [props.className] - Additional CSS classes
 */
export function VirtualizedList({
  items,
  renderItem,
  itemHeight,
  height = 400,
  width = '100%',
  itemKey,
  overscanCount = 5,
  className = '',
}) {
  const itemData = { items, renderItem, itemKey };
  
  const getItemKey = useCallback((index, data) => {
    if (data.itemKey) {
      return data.itemKey(data.items[index], index);
    }
    return index;
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  // For small lists, render normally without virtualization
  if (items.length <= 50) {
    return (
      <div className={className}>
        {items.map((item, index) => (
          <div key={itemKey ? itemKey(item, index) : index}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width={width}
      itemData={itemData}
      itemKey={getItemKey}
      overscanCount={overscanCount}
      className={className}
    >
      {MemoizedRow}
    </List>
  );
}

/**
 * VirtualizedTable - Virtualized table specifically for table rows
 * Use this when you have a large table with many rows
 * 
 * @param {Object} props
 * @param {Array} props.rows - Array of row data
 * @param {Function} props.renderRow - Function to render each row: (row, index) => ReactNode
 * @param {number} props.rowHeight - Height of each row in pixels
 * @param {number} [props.height=500] - Total height of the table body
 * @param {Function} [props.rowKey] - Function to get unique key for each row
 */
export function VirtualizedTable({
  rows,
  renderRow,
  rowHeight,
  height = 500,
  rowKey,
}) {
  return (
    <VirtualizedList
      items={rows}
      renderItem={renderRow}
      itemHeight={rowHeight}
      height={height}
      width="100%"
      itemKey={rowKey}
    />
  );
}

/**
 * Helper HOC to memoize table row components
 * Wrap your row component with this to prevent unnecessary re-renders
 */
export function withMemoizedRow(RowComponent) {
  return memo(RowComponent, (prevProps, nextProps) => {
    // Custom comparison - only re-render if item data changed
    return JSON.stringify(prevProps.item) === JSON.stringify(nextProps.item);
  });
}

export default VirtualizedList;
