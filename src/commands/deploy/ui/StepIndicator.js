import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import gradient from 'gradient-string'

const PULSE_ICONS = ['●', '◉', '⦿', '◉']
const ORANGE_SHADES = ['#F97316', '#FB923C', '#FDBA74'] // orange-500, 400, 300

// Steps that involve costs (Upload, Create, Resources)
const PAID_STEPS = new Set([1, 2, 3])

// Gradient for completed text (teal to blue)
const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

export function StepIndicator({ steps, currentStep, completedSteps = [] }) {
  const [pulse_frame, set_pulse_frame] = useState(0)

  useEffect(() => {
    if (currentStep < 0) return

    const interval = setInterval(() => {
      set_pulse_frame(prev => (prev + 1) % PULSE_ICONS.length)
    }, 600)

    return () => clearInterval(interval)
  }, [currentStep])

  return React.createElement(
    Box,
    { paddingLeft: 2 },
    steps.map((step, idx) => {
      const is_completed = completedSteps.includes(idx)
      const is_current = currentStep === idx
      const is_last = idx === steps.length - 1
      const has_cost = PAID_STEPS.has(idx)

      const icon = is_completed
        ? '✓'
        : is_current
          ? PULSE_ICONS[pulse_frame]
          : '○'
      const icon_color = is_completed
        ? '#2DD4BF'
        : is_current
          ? ORANGE_SHADES[pulse_frame % ORANGE_SHADES.length]
          : '#64748B'
      const connector = is_completed ? ' ━━ ' : ' ── '

      // Build label with cost indicator
      const label_text = step.shortLabel || step.label
      const label_with_indicator = has_cost ? `${label_text} ⛓` : label_text

      return React.createElement(
        React.Fragment,
        { key: idx },
        React.createElement(Text, { color: icon_color }, icon + ' '),
        is_completed
          ? React.createElement(
              Text,
              null,
              completed_gradient(label_with_indicator),
            )
          : React.createElement(
              Text,
              {
                color: is_current
                  ? ORANGE_SHADES[pulse_frame % ORANGE_SHADES.length]
                  : '#64748B',
              },
              label_with_indicator,
            ),
        !is_last && React.createElement(Text, { color: '#64748B' }, connector),
      )
    }),
  )
}
