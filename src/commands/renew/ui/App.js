import React, { useState, useEffect } from 'react'
import { Box, Text, Static } from 'ink'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import gradient from 'gradient-string'

import { Header } from '../../../ui/Header.js'

import { ConfirmDialog } from './ConfirmDialog.js'
import { GlowingBox } from './GlowingBox.js'

const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

const COLORS = {
  sui: '#4DA2FF',
  success: '#2DD4BF',
  error: '#F43F5E',
  dim: '#64748B',
}

const STEPS = {
  EPOCHS_INPUT: 'epochs_input',
  CONFIRM: 'confirm',
  EXTENDING: 'extending',
  DONE: 'done',
}

export default function App({
  site_id,
  blob_count,
  epochs = null,
  auto_yes = false,
  on_step_change,
  on_complete,
  on_error,
}) {
  const [step, set_step] = useState(STEPS.EPOCHS_INPUT)
  const [epochs_input, set_epochs_input] = useState(epochs?.toString() || '')
  const [completed_steps, set_completed_steps] = useState([])
  const [error, set_error] = useState(null)
  const [current_blob_index, set_current_blob_index] = useState(0)
  const [results, set_results] = useState([])

  // Auto-advance if epochs pre-filled
  useEffect(() => {
    if (epochs && step === STEPS.EPOCHS_INPUT) {
      handle_epochs_submit()
    }
  }, [step])

  // Auto-advance confirm if auto_yes
  useEffect(() => {
    if (step === STEPS.CONFIRM && auto_yes) {
      handle_confirm(true)
    }
  }, [step, auto_yes])

  const advance_step = (next_step, data = {}) => {
    if (step !== next_step) {
      const step_log = get_step_log(step, data)
      if (step_log) {
        set_completed_steps(prev => [...prev, step_log])
      }
    }

    set_step(next_step)
  }

  const get_step_log = (completed_step, data) => {
    switch (completed_step) {
      case STEPS.EPOCHS_INPUT:
        return `✓ Extension: ${data.epochs} epoch${data.epochs === 1 ? '' : 's'}`
      case STEPS.CONFIRM:
        return `✓ Confirmed renewal for ${blob_count} blob${blob_count === 1 ? '' : 's'}`
      default:
        return null
    }
  }

  const handle_epochs_submit = () => {
    const parsed = parseInt(epochs_input, 10)
    if (isNaN(parsed) || parsed < 1) {
      set_error('Duration must be a positive number')
      return
    }
    set_error(null)
    advance_step(auto_yes ? STEPS.EXTENDING : STEPS.CONFIRM, { epochs: parsed })
  }

  const handle_confirm = confirmed => {
    if (!confirmed) {
      if (on_error) {
        on_error(new Error('User cancelled operation'))
      }
      return
    }
    advance_step(STEPS.EXTENDING)
  }

  // Handler: EXTENDING step
  useEffect(() => {
    if (step !== STEPS.EXTENDING || !on_step_change) return

    const execute_extending = async () => {
      try {
        const parsed_epochs = parseInt(epochs_input, 10)
        const extension_results = await on_step_change('extending', {
          epochs: parsed_epochs,
          on_progress: (index, total) => {
            set_current_blob_index(index)
          },
        })

        set_results(extension_results)
        const success_count = extension_results.filter(r => r.success).length
        advance_step(STEPS.DONE, {
          success_count,
          total_count: extension_results.length,
        })

        if (on_complete) {
          on_complete({
            success: success_count,
            total: extension_results.length,
            results: extension_results,
          })
        }
      } catch (err) {
        set_error(err.message)
        if (on_error) {
          on_error(err)
        }
      }
    }

    execute_extending()
  }, [step])

  const render_current_step = () => {
    const needs_top_margin = completed_steps.length === 0

    return React.createElement(
      Box,
      { flexDirection: 'column', marginTop: needs_top_margin ? 2 : 0 },
      error &&
        React.createElement(
          Box,
          { marginBottom: 1 },
          React.createElement(Text, { color: COLORS.error }, '✗ ', error),
        ),
      step === STEPS.EPOCHS_INPUT &&
        React.createElement(
          Box,
          { flexDirection: 'column', width: 60, alignItems: 'center' },
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: '#78716C', italic: true },
              'Extend storage duration for all blobs (1 epoch ≈ 1 day)',
            ),
          ),
          React.createElement(
            Box,
            { marginTop: 1, alignSelf: 'flex-start' },
            React.createElement(
              Text,
              { color: '#FFFBEB' },
              `❯ Extend by how many epochs? [5]: `,
            ),
            React.createElement(TextInput, {
              value: epochs_input || '',
              onChange: set_epochs_input,
              onSubmit: handle_epochs_submit,
            }),
          ),
        ),
      step === STEPS.CONFIRM &&
        !auto_yes &&
        React.createElement(ConfirmDialog, {
          title: 'Extend storage?',
          details: [
            `Blobs: ${blob_count}`,
            `Duration: ${epochs_input} epoch${parseInt(epochs_input) === 1 ? '' : 's'}`,
            `Site ID: ${site_id.slice(0, 16)}...`,
          ],
          on_confirm: confirmed => handle_confirm(confirmed),
          on_cancel: confirmed => handle_confirm(confirmed),
        }),
      step === STEPS.EXTENDING &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'dots' }),
            ' ',
            `Extending blob ${current_blob_index + 1}/${blob_count}...`,
          ),
        ),
      step === STEPS.DONE &&
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          React.createElement(
            Text,
            { color: COLORS.success, bold: true },
            `✓ Renewed ${results.filter(r => r.success).length}/${results.length} blob${results.length === 1 ? '' : 's'}`,
          ),
          results.filter(r => !r.success).length > 0 &&
            React.createElement(
              Box,
              { marginTop: 1 },
              React.createElement(
                Text,
                { color: COLORS.error },
                `✗ ${results.filter(r => !r.success).length} failed`,
              ),
            ),
        ),
    )
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },

    // Header
    React.createElement(Static, { items: [{ id: 'header' }] }, item =>
      React.createElement(Header, { key: item.id }),
    ),

    // Completed steps
    completed_steps.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        completed_steps.map((log, idx) =>
          React.createElement(Text, { key: idx }, completed_gradient(log)),
        ),
      ),

    // Current step
    render_current_step(),
  )
}
