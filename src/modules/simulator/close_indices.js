const { MAX_CANDIDATE_INDICES } = require('./utils');

// Calculate number of nodes to include before and after the main position
const CANDIDATE_NODES_EACH_SIDE = Math.floor((MAX_CANDIDATE_INDICES - 1) / 2);

// Special value indicating no prev/next order in the linked list
const NO_ORDER = 65535;

/**
 * Find order in array by its index field
 *
 * @param {Array} orders - Orders array
 * @param {number} index - Order's index field value
 * @returns {Object|null} Found order object or null
 */
function findOrderByIndex(orders, index) {
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].index === index) {
      return orders[i];
    }
  }
  return null;
}

/**
 * Generate candidate insertion indices for closing long position
 *
 * @param {string} mint - Token address
 * @param {number|string|anchor.BN} closeOrderId - Order ID to close (order_id, not index)
 * @param {Object|null} ordersData - Orders data (optional, will fetch if not provided)
 * @returns {Promise<Object>} Returns object containing candidate indices array
 *   - closeOrderIndices: {number[]} Candidate insertion position indices array
 *
 * @throws {Error} If closeOrderId is not found
 *
 * @example
 * // Close a long position order
 * const result = await sdk.simulator.simulateLongClose(
 *   'HG9R8CE9N18U8zYqo6cqS4bFaCAzHbAhaAe1zq8Hq7PF',
 *   1090  // order_id
 * );
 * console.log('Candidate indices:', result.closeOrderIndices);
 * // Output: { closeOrderIndices: [25, 15, 35, 5, 45, ...] }
 */
async function simulateLongClose(mint, closeOrderId, ordersData = null) {
  // 1. Fetch down_orders data (long orders are in down_orders)
  if (!ordersData) {
    ordersData = await this.sdk.data.orders(mint, { type: 'down_orders' });
  }

  if (!ordersData || !ordersData.success || !ordersData.data || !ordersData.data.orders) {
    throw new Error('Failed to fetch down_orders data');
  }

  const orders = ordersData.data.orders;

  // 2. Convert closeOrderId to string (since order_id returned by the API is a string)
  const targetOrderId = closeOrderId.toString();

  // 3. Find the matching order in the order list
  let targetOrderIndex = -1;
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].order_id === targetOrderId) {
      targetOrderIndex = i;
      break;
    }
  }

  // 4. If the order is not found, throw an error
  if (targetOrderIndex === -1) {
    throw new Error(`Order with order_id ${targetOrderId} not found in down_orders`);
  }

  // 5. Get the OrderBook index of the target order
  const targetOrder = orders[targetOrderIndex];
  const mainIndex = targetOrder.index;

  // 6. Generate the candidate indices array (traverse prev/next nodes via the linked list structure)
  const indices = [];

  // Add the main position
  indices.push(mainIndex);

  // Add indices of prev/next nodes via the linked list structure
  let prevNode = targetOrder;
  let nextNode = targetOrder;

  for (let offset = 1; offset <= CANDIDATE_NODES_EACH_SIDE; offset++) {
    // Add the offset-th preceding node (via the prev_order linked list pointer)
    if (prevNode.prev_order !== NO_ORDER) {
      const prevOrder = findOrderByIndex(orders, prevNode.prev_order);
      if (prevOrder && prevOrder.index !== undefined) {
        indices.push(prevOrder.index);
        prevNode = prevOrder; // Continue traversing backward
      } else {
        prevNode = { prev_order: NO_ORDER }; // Stop if not found
      }
    }

    // Add the offset-th following node (via the next_order linked list pointer)
    if (nextNode.next_order !== NO_ORDER) {
      const nextOrder = findOrderByIndex(orders, nextNode.next_order);
      if (nextOrder && nextOrder.index !== undefined) {
        indices.push(nextOrder.index);
        nextNode = nextOrder; // Continue traversing forward
      } else {
        nextNode = { next_order: NO_ORDER }; // Stop if not found
      }
    }
  }

  // 7. Return the result
  return {
    closeOrderIndices: indices
  };
}

/**
 * Generate candidate insertion indices for closing short position
 *
 * @param {string} mint - Token address
 * @param {number|string|anchor.BN} closeOrderId - Order ID to close (order_id, not index)
 * @param {Object|null} ordersData - Orders data (optional, will fetch if not provided)
 * @returns {Promise<Object>} Returns object containing candidate indices array
 *   - closeOrderIndices: {number[]} Candidate insertion position indices array
 *
 * @throws {Error} If closeOrderId is not found
 *
 * @example
 * // Close a short position order
 * const result = await sdk.simulator.simulateShortClose(
 *   'HG9R8CE9N18U8zYqo6cqS4bFaCAzHbAhaAe1zq8Hq7PF',
 *   1090  // order_id
 * );
 * console.log('Candidate indices:', result.closeOrderIndices);
 * // Output: { closeOrderIndices: [25, 15, 35, 5, 45, ...] }
 */
async function simulateShortClose(mint, closeOrderId, ordersData = null) {
  // 1. Fetch up_orders data (short orders are in up_orders)
  if (!ordersData) {
    ordersData = await this.sdk.data.orders(mint, { type: 'up_orders' });
  }

  if (!ordersData || !ordersData.success || !ordersData.data || !ordersData.data.orders) {
    throw new Error('Failed to fetch up_orders data');
  }

  const orders = ordersData.data.orders;

  // 2. Convert closeOrderId to string (since order_id returned by the API is a string)
  const targetOrderId = closeOrderId.toString();

  // 3. Find the matching order in the order list
  let targetOrderIndex = -1;
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].order_id === targetOrderId) {
      targetOrderIndex = i;
      break;
    }
  }

  // 4. If the order is not found, throw an error
  if (targetOrderIndex === -1) {
    throw new Error(`Order with order_id ${targetOrderId} not found in up_orders`);
  }

  // 5. Get the OrderBook index of the target order
  const targetOrder = orders[targetOrderIndex];
  const mainIndex = targetOrder.index;

  // 6. Generate the candidate indices array (traverse prev/next nodes via the linked list structure)
  const indices = [];

  // Add the main position
  indices.push(mainIndex);

  // Add indices of prev/next nodes via the linked list structure
  let prevNode = targetOrder;
  let nextNode = targetOrder;

  for (let offset = 1; offset <= CANDIDATE_NODES_EACH_SIDE; offset++) {
    // Add the offset-th preceding node (via the prev_order linked list pointer)
    if (prevNode.prev_order !== NO_ORDER) {
      const prevOrder = findOrderByIndex(orders, prevNode.prev_order);
      if (prevOrder && prevOrder.index !== undefined) {
        indices.push(prevOrder.index);
        prevNode = prevOrder; // Continue traversing backward
      } else {
        prevNode = { prev_order: NO_ORDER }; // Stop if not found
      }
    }

    // Add the offset-th following node (via the next_order linked list pointer)
    if (nextNode.next_order !== NO_ORDER) {
      const nextOrder = findOrderByIndex(orders, nextNode.next_order);
      if (nextOrder && nextOrder.index !== undefined) {
        indices.push(nextOrder.index);
        nextNode = nextOrder; // Continue traversing forward
      } else {
        nextNode = { next_order: NO_ORDER }; // Stop if not found
      }
    }
  }

  // 7. Return the result
  return {
    closeOrderIndices: indices
  };
}

module.exports = {
  simulateLongClose,
  simulateShortClose
};
