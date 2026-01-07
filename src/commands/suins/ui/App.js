import React, { useState, useEffect } from 'react'
import { Box, Text, Static } from 'ink'
import Spinner from 'ink-spinner'
import gradient from 'gradient-string'

import { Header } from '../../deploy/ui/Header.js'
import { SiteSelector } from '../../../ui/SiteSelector.js'
import { ConfirmDialog } from '../../deploy/ui/ConfirmDialog.js'
import { GlowingBox } from '../../deploy/ui/GlowingBox.js'

const completed_gradient = gradient(['#2DD4BF', '#4DA2FF'])

const COLORS = {
  sui: '#4DA2FF',
  accent: '#00D4FF',
  success: '#2DD4BF',
  error: '#F43F5E',
  dim: '#64748B',
}

const STEPS = {
  SELECT_SITE: 'select_site',
  CONFIRM: 'confirm',
  LINKING: 'linking',
  DONE: 'done',
}

export default function App({
  suins_name,
  site_id = null,
  auto_yes = false,
  onStepChange,
  onComplete,
  onError,
}) {
  const [step, setStep] = useState(STEPS.SELECT_SITE)
  const [selected_site, setSelectedSite] = useState(null)
  const [completed_steps, setCompletedSteps] = useState([])
  const [spinner_text, setSpinnerText] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [sites, setSites] = useState([])
  const [sites_loading, setSitesLoading] = useState(true)

  // Load sites on mount
  useEffect(() => {
    const load_sites = async () => {
      try {
        setSitesLoading(true)
        const sites_data = await onStepChange?.('load_sites', {})
        setSites(sites_data || [])

        // If site_id provided, skip to confirm
        if (site_id) {
          const found_site = sites_data?.find(s => s.id === site_id)
          if (found_site) {
            setSelectedSite(found_site)
            advanceStep(STEPS.CONFIRM, {
              site_name: found_site.name,
            })
          }
        }
      } catch (err) {
        handleError(err)
      } finally {
        setSitesLoading(false)
      }
    }

    load_sites()
  }, [])

  // Auto-confirm if auto_yes
  useEffect(() => {
    if (step === STEPS.CONFIRM && auto_yes) {
      advanceStep(STEPS.LINKING)
    }
  }, [step, auto_yes])

  const advanceStep = (next_step, data = {}) => {
    if (step !== next_step) {
      const step_log = getStepLog(step, data)
      if (step_log) {
        setCompletedSteps(prev => [...prev, step_log])
      }
    }

    setStep(next_step)
  }

  const getStepLog = (completed_step, data) => {
    switch (completed_step) {
      case STEPS.SELECT_SITE:
        return `✓ Selected site: ${data.site_name || 'Unknown'}`
      case STEPS.CONFIRM:
        return `✓ Confirmed link: ${suins_name}`
      case STEPS.LINKING:
        return `✓ Linked ${suins_name} to site`
      default:
        return null
    }
  }

  const handleSiteSelect = site => {
    setSelectedSite(site)
    advanceStep(STEPS.CONFIRM, {
      site_name: site.name,
    })
  }

  const handleConfirm = confirmed => {
    if (!confirmed) {
      if (onError) {
        onError(new Error('User cancelled operation'))
      }
      return
    }
    advanceStep(STEPS.LINKING)
  }

  const handleComplete = final_result => {
    setResult(final_result)
    advanceStep(STEPS.DONE)
    if (onComplete) {
      onComplete(final_result)
    }
  }

  const handleError = err => {
    setError(err.message)
    if (onError) {
      onError(err)
    }
  }

  // Handler: LINKING step
  useEffect(() => {
    if (step !== STEPS.LINKING || !onStepChange || !selected_site) return

    const execute_link = async () => {
      try {
        setSpinnerText('Building transaction...')
        const data = await onStepChange('link', {
          suins_name,
          site_id: selected_site.id,
        })

        handleComplete({
          suins_name,
          site_id: selected_site.id,
          site_name: selected_site.name,
          tx_digest: data.tx_digest,
          url: `https://${suins_name.replace('.sui', '')}.suins.site`,
        })
      } catch (err) {
        handleError(err)
      }
    }

    execute_link()
  }, [step, selected_site])

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

      step === STEPS.SELECT_SITE &&
        React.createElement(
          Box,
          { flexDirection: 'column' },
          React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(
              Text,
              { bold: true, color: COLORS.accent },
              `Link ${suins_name} to a site:`,
            ),
          ),
          React.createElement(SiteSelector, {
            sites: sites.map(s => ({
              name: s.name,
              object_id: s.id,
              resource_count: 0,
            })),
            on_select: handleSiteSelect,
            is_loading: sites_loading,
          }),
        ),

      step === STEPS.CONFIRM &&
        !auto_yes &&
        React.createElement(ConfirmDialog, {
          title: 'Link SuiNS name to site?',
          details: [
            `SuiNS: ${suins_name}`,
            `Site: ${selected_site?.name || 'Unknown'}`,
            `Site ID: ${selected_site?.id || 'Unknown'}`,
          ],
          onConfirm: () => handleConfirm(true),
          onCancel: () => handleConfirm(false),
        }),

      step === STEPS.LINKING &&
        React.createElement(
          GlowingBox,
          { color: COLORS.sui },
          React.createElement(
            Text,
            { color: COLORS.sui },
            React.createElement(Spinner, { type: 'dots' }),
            ' ',
            spinner_text,
          ),
        ),

      step === STEPS.DONE &&
        result &&
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          React.createElement(
            Text,
            { color: COLORS.success, bold: true },
            `✓ Linked ${suins_name} to ${result.site_name}!`,
          ),
          React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { dimColor: true },
              'Site ID: ',
              result.site_id,
            ),
          ),
          result.url &&
            React.createElement(
              Box,
              { marginTop: 1 },
              React.createElement(
                Text,
                { color: COLORS.accent },
                'Access at: ',
                result.url,
              ),
            ),
        ),
    )
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },

    // Header (Static)
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
