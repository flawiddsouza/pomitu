/**
 * Drop-in replacement for ink-select-input's SelectInput that preserves scroll
 * position when items change, instead of resetting to the top.
 */
import { isDeepStrictEqual } from 'node:util'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Box, useInput, useStdin } from 'ink'
import { Indicator, Item as ItemComponent } from 'ink-select-input'
import type { IndicatorProps, ItemProps } from 'ink-select-input'
import type { FC } from 'react'

type SelectItem<V> = {
    key?: string
    label: string
    value: V
}

type Props<V> = {
    items?: Array<SelectItem<V>>
    isFocused?: boolean
    initialIndex?: number
    limit?: number
    indicatorComponent?: FC<IndicatorProps>
    itemComponent?: FC<ItemProps>
    onSelect?: (item: SelectItem<V>) => void
    onHighlight?: (item: SelectItem<V>) => void
}

function rotateArray<T>(arr: T[], k: number): T[] {
    if (arr.length === 0) return arr
    const n = arr.length
    const steps = ((k % n) + n) % n
    if (steps === 0) return [...arr]
    return [...arr.slice(-steps), ...arr.slice(0, -steps)]
}

export function PersistentSelectInput<V>({
    items = [],
    isFocused = true,
    initialIndex = 0,
    indicatorComponent: IndicatorComp = Indicator as FC<IndicatorProps>,
    itemComponent: ItemComp = ItemComponent as FC<ItemProps>,
    limit: customLimit,
    onSelect,
    onHighlight,
}: Props<V>) {
    const hasLimit = typeof customLimit === 'number' && items.length > customLimit
    const limit = hasLimit ? Math.min(customLimit, items.length) : items.length
    const lastIndex = limit - 1

    const [rotateIndex, setRotateIndex] = useState(
        initialIndex > lastIndex ? lastIndex - initialIndex : 0
    )
    const [selectedIndex, setSelectedIndex] = useState(
        initialIndex ? (initialIndex > lastIndex ? lastIndex : initialIndex) : 0
    )

    const previousItems = useRef(items)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { internal_eventEmitter } = useStdin() as any

    useEffect(() => {
        if (!isFocused || items.length === 0) return

        const handleHomeEnd = (data: Buffer) => {
            const str = data.toString()
            const isHome = str === '\x1b[H' || str === '\x1bOH' || str === '\x1b[1~' || str === '\x1b[7~'
            const isEnd = str === '\x1b[F' || str === '\x1bOF' || str === '\x1b[4~' || str === '\x1b[8~'

            if (isHome) {
                setSelectedIndex(0)
                setRotateIndex(0)
                if (typeof onHighlight === 'function' && items[0]) onHighlight(items[0])
            }

            if (isEnd) {
                if (hasLimit) {
                    const newRotateIndex = -(items.length - limit)
                    setRotateIndex(newRotateIndex)
                    setSelectedIndex(limit - 1)
                    const sliced = rotateArray(items, newRotateIndex).slice(0, limit)
                    if (typeof onHighlight === 'function' && sliced[limit - 1]) onHighlight(sliced[limit - 1])
                } else {
                    const lastIdx = items.length - 1
                    setSelectedIndex(lastIdx)
                    if (typeof onHighlight === 'function' && items[lastIdx]) onHighlight(items[lastIdx])
                }
            }
        }

        internal_eventEmitter?.on('input', handleHomeEnd)
        return () => {
            internal_eventEmitter?.removeListener('input', handleHomeEnd)
        }
    }, [isFocused, items, hasLimit, limit, onHighlight, internal_eventEmitter])

    useEffect(() => {
        if (!isDeepStrictEqual(
            previousItems.current.map(item => item.value),
            items.map(item => item.value)
        )) {
            const newHasLimit = typeof customLimit === 'number' && items.length > customLimit
            if (newHasLimit) {
                // Clamp scroll and cursor to new valid bounds
                const maxScroll = items.length - customLimit!
                setRotateIndex(prev => Math.max(-maxScroll, Math.min(0, prev)))
                setSelectedIndex(prev => Math.min(prev, customLimit! - 1))
            } else {
                // No scrolling needed anymore
                setRotateIndex(0)
                setSelectedIndex(prev => Math.min(prev, Math.max(0, items.length - 1)))
            }
        }
        previousItems.current = items
    }, [items, customLimit])

    useInput(useCallback((input, key) => {
        if (input === 'k' || key.upArrow) {
            const atVisualTop = selectedIndex === 0
            if (hasLimit) {
                if (atVisualTop) {
                    if (rotateIndex < 0) {
                        // Scroll window up
                        const nextRotateIndex = rotateIndex + 1
                        setRotateIndex(nextRotateIndex)
                        const sliced = rotateArray(items, nextRotateIndex).slice(0, limit)
                        if (typeof onHighlight === 'function' && sliced[0]) onHighlight(sliced[0])
                    }
                    // else: already at absolute top, do nothing
                } else {
                    const nextSelectedIndex = selectedIndex - 1
                    setSelectedIndex(nextSelectedIndex)
                    const sliced = rotateArray(items, rotateIndex).slice(0, limit)
                    if (typeof onHighlight === 'function' && sliced[nextSelectedIndex]) onHighlight(sliced[nextSelectedIndex])
                }
            } else {
                // No limit: wrap around
                const nextSelectedIndex = atVisualTop ? items.length - 1 : selectedIndex - 1
                setSelectedIndex(nextSelectedIndex)
                if (typeof onHighlight === 'function' && items[nextSelectedIndex]) onHighlight(items[nextSelectedIndex])
            }
        }

        if (input === 'j' || key.downArrow) {
            const atVisualBottom = selectedIndex === (hasLimit ? limit : items.length) - 1
            if (hasLimit) {
                const atAbsBottom = rotateIndex <= -(items.length - limit)
                if (atVisualBottom) {
                    if (!atAbsBottom) {
                        // Scroll window down
                        const nextRotateIndex = rotateIndex - 1
                        setRotateIndex(nextRotateIndex)
                        const sliced = rotateArray(items, nextRotateIndex).slice(0, limit)
                        if (typeof onHighlight === 'function' && sliced[limit - 1]) onHighlight(sliced[limit - 1])
                    }
                    // else: already at absolute bottom, do nothing
                } else {
                    const nextSelectedIndex = selectedIndex + 1
                    setSelectedIndex(nextSelectedIndex)
                    const sliced = rotateArray(items, rotateIndex).slice(0, limit)
                    if (typeof onHighlight === 'function' && sliced[nextSelectedIndex]) onHighlight(sliced[nextSelectedIndex])
                }
            } else {
                // No limit: wrap around
                const nextSelectedIndex = atVisualBottom ? 0 : selectedIndex + 1
                setSelectedIndex(nextSelectedIndex)
                if (typeof onHighlight === 'function' && items[nextSelectedIndex]) onHighlight(items[nextSelectedIndex])
            }
        }

        if (/^[1-9]$/.test(input)) {
            const targetIndex = Number.parseInt(input, 10) - 1
            const visibleItems = hasLimit
                ? rotateArray(items, rotateIndex).slice(0, limit)
                : items
            if (targetIndex >= 0 && targetIndex < visibleItems.length) {
                const selectedItem = visibleItems[targetIndex]
                if (selectedItem) {
                    onSelect?.(selectedItem)
                }
            }
        }

        if (key.return) {
            const slicedItems = hasLimit
                ? rotateArray(items, rotateIndex).slice(0, limit)
                : items
            if (typeof onSelect === 'function') {
                onSelect(slicedItems[selectedIndex])
            }
        }
    }, [hasLimit, limit, rotateIndex, selectedIndex, items, onSelect, onHighlight]), { isActive: isFocused })

    const slicedItems = hasLimit
        ? rotateArray(items, rotateIndex).slice(0, limit)
        : items

    return (
        <Box flexDirection="column">
            {slicedItems.map((item, index) => {
                const isSelected = index === selectedIndex
                return (
                    <Box key={(item as any).key ?? String(item.value)}>
                        <IndicatorComp isSelected={isSelected} />
                        <ItemComp isSelected={isSelected} label={item.label} />
                    </Box>
                )
            })}
        </Box>
    )
}
