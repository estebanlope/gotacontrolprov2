// ─── Types ────────────────────────────────────────────────────────────────────
interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

interface TelegramTeam {
  telegram_bot_active: boolean
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  name: string
}

// ─── Supabase helper ─────────────────────────────────────────────────────────
async function supabaseFetch(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers ?? {}),
    },
  })
}

// ─── Telegram sender ─────────────────────────────────────────────────────────
async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
}

async function getTeamBot(env: Env, teamId: string): Promise<TelegramTeam | null> {
  const res = await supabaseFetch(env, `/teams?id=eq.${teamId}&select=name,telegram_bot_active,telegram_bot_token,telegram_chat_id`)
  const data: TelegramTeam[] = await res.json()
  if (!data[0]?.telegram_bot_active || !data[0]?.telegram_bot_token || !data[0]?.telegram_chat_id) return null
  return data[0]
}

// ─── Message Formatters ───────────────────────────────────────────────────────
function formatLoanMessage(body: Record<string, unknown>): string {
  const loan = body.loan as Record<string, unknown>
  const client = body.client as Record<string, unknown>
  const schedule = (body.schedule as Record<string, unknown>[]) ?? []

  return [
   `🏦 *NUEVO PRÉSTAMO*`,
   `━━━━━━━━━━━━━━━━━━`, ``,
   `👤 *Cliente:* ${client?.full_name ?? "—"}`,
   `🪪 *Cédula:* ${client?.cedula ?? "—"}`,
   `📱 *Teléfono:* ${client?.phone ?? "—"}`, ``,
   `💰 *Capital:* $${Number(loan.capital).toLocaleString("es-CO")}`,
   `📊 *Interés:* ${loan.interest_rate}%`,
   `💵 *Total a pagar:* $${(Number(loan.capital) * (1 + Number(loan.interest_rate) / 100)).toLocaleString("es-CO")}`,
   `📋 *Cuotas:* ${schedule.length} de $${schedule[0] ? Number(schedule[0].amount).toLocaleString("es-CO") : "—"} c/u`,
   `📅 *Tipo de pago:* ${paymentTypeLabel(String(loan.payment_type))}`, ``,
   `⏳ *Plazo:* ${loan.term_weeks} semanas`,
   `📆 *Desembolso:* ${loan.disbursement_date}`,
   `🔚 *Vencimiento:* ${loan.due_date}`,
   `━━━━━━━━━━━━━━━━━━`
  ].join('\n')
}

function formatPaymentMessage(body: Record<string, unknown>): string {
  const payment = body.payment as Record<string, unknown>
  const loan = body.loan as Record<string, unknown>
  const client = body.client as Record<string, unknown>

  return [
    `✅ *PAGO REGISTRADO*`,
    `━━━━━━━━━━━━━━━━━━`, ``,
    `👤 *Cliente:* ${client?.full_name ?? "—"}`,
    `📱 *Teléfono:* ${client?.phone ?? "—"}`, ``,
    `💰 *Monto pagado:* $${Number(payment.amount).toLocaleString("es-CO")}`,
    `💳 *Método:* ${payment.method === "cash" ? "💵 Efectivo" : "🔄 Transferencia"}`,
    `📅 *Fecha:* ${payment.payment_date}`, ``,
    `📌 *Préstamo:* $${Number(loan?.capital ?? 0).toLocaleString("es-CO")} · ${paymentTypeLabel(String(loan?.payment_type ?? ""))}`,
    loan?.next_payment_date ? `📆 *Próximo pago:* ${loan.next_payment_date}` : ""
  ].filter(Boolean).join('\n')
}

function formatExpenseMessage(body: Record<string, unknown>): string {
  const expense = body.expense as Record<string, unknown>

  const typeLabels: Record<string, string> = {
    gasolina: '⛽ Gasolina',
    transporte: '🚌 Transporte',
    salario: '💼 Salario',
    otros: '📦 Otros',
  }

  return [
    `📉 *GASTO REGISTRADO*`,
    `━━━━━━━━━━━━━━━━━━`, ``,
    `🏷️ *Tipo:* ${typeLabels[String(expense.type)] ?? expense.type}`,
    `💵 *Monto:* $${Number(expense.amount).toLocaleString("es-CO")}`,
    expense.notes ? `📝 *Notas:* ${expense.notes}` : "",
    `👤 *Registrado por:* ${body.username ?? "—"}`,
    `📅 *Fecha:* ${String(expense.created_at).split("T")[0]}`
  ].filter(Boolean).join('\n')
}

async function formatSummaryMessage(env: Env, teamId: string, dateFrom: string, dateTo: string, teamName: string): Promise<string> {
    // Convert Colombia date range to UTC range for created_at filters
  const utcStart = `${dateFrom}T05:00:00.000Z`
  const utcEndDate = new Date(`${dateTo}T05:00:00.000Z`)
  utcEndDate.setUTCDate(utcEndDate.getUTCDate() + 1)
  utcEndDate.setUTCSeconds(utcEndDate.getUTCSeconds() - 1)
  const utcEnd = utcEndDate.toISOString().replace(/\.\d{3}Z$/, '.999Z')

  const [paymentsRes, loansRes, expensesRes] = await Promise.all([
    supabaseFetch(env, `/payments?team_id=eq.${teamId}&payment_date=gte.${dateFrom}&payment_date=lte.${dateTo}&select=amount,method`),
    supabaseFetch(env, `/loans?team_id=eq.${teamId}&created_at=gte.${encodeURIComponent(utcStart)}&created_at=lte.${encodeURIComponent(utcEnd)}&select=capital`),
    supabaseFetch(env, `/expenses?team_id=eq.${teamId}&created_at=gte.${encodeURIComponent(utcStart)}&created_at=lte.${encodeURIComponent(utcEnd)}&select=amount`),
  ])

  const payments: { amount: number; method: string }[] = await paymentsRes.json()
  const loans: { capital: number }[] = await loansRes.json()
  const expenses: { amount: number }[] = await expensesRes.json()

  const totalIncome = payments.reduce((s, p) => s + p.amount, 0)
  const numPayments = payments.length
  const cashIncome = payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
  const transferIncome = payments.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0)

  const totalLoaned = loans.reduce((s, l) => s + l.capital, 0)
  const numLoans = loans.length

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netBalance = totalIncome - totalLoaned - totalExpenses

  return [
    `📊 *RESUMEN DE CARTERA*`,
    `🏢 ${teamName}`,
    `📅 ${dateFrom} → ${dateTo}`,
    `━━━━━━━━━━━━━━━━━━`, ``,
    `💚 *INGRESOS (${numPayments} recaudos)*`,
    `   Total: $${totalIncome.toLocaleString("es-CO")}`,
    `   💵 Efectivo: $${cashIncome.toLocaleString("es-CO")}`,
    `   🔄 Transferencia: $${transferIncome.toLocaleString("es-CO")}`, ``,
    `🔴 *EGRESOS (${numLoans} préstamos)*`,
    `   Capital prestado: $${totalLoaned.toLocaleString("es-CO")}`, ``,
    `📉 *GASTOS*`,
    `   Total: $${totalExpenses.toLocaleString("es-CO")}`, ``,
    `${netBalance >= 0 ? "✅" : "⚠️"} *SALDO NETO: $${netBalance.toLocaleString("es-CO")}*`
  ].join('\n')
}

function paymentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual'
  }
  return labels[type] ?? type
}

// ─── Weekly cleanup (Cron) ───────────────────────────────────────────────────
async function runWeeklyCleanup(env: Env): Promise<void> {
  const res = await supabaseFetch(env, `/teams?telegram_bot_active=eq.true&select=id,name,telegram_bot_token,telegram_chat_id`)
  const teams: { id: string; name: string; telegram_bot_token: string; telegram_chat_id: string }[] = await res.json()

  const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })

  for (const team of teams) {
    try {
      const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cleanup_inactive_clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ p_team_id: team.id, p_months: 6 }),
      })

      const result: { success: boolean; clients_deleted: number; error?: string } = await rpcRes.json()

      let message: string
      if (result.success) {
        message = [
          `🧹 *LIMPIEZA SEMANAL AUTOMÁTICA*`,
          `🏢 ${team.name}`,
          `📅 ${today}`,
          ``,
          result.clients_deleted > 0
            ? `🗑️ *Se eliminaron ${result.clients_deleted} cliente(s)* inactivos con más de 6 meses sin préstamos.`
            : `✅ *Sin clientes para eliminar.* Todos los clientes tienen actividad reciente.`,
          ``,
          `⏰ Próxima limpieza: domingo siguiente`,
        ].join('\n')
      } else {
        message = [
          `⚠️ *ERROR EN LIMPIEZA SEMANAL*`,
          `🏢 ${team.name}`,
          `📅 ${today}`,
          ``,
          `❌ Error: ${result.error ?? 'Error desconocido'}`,
        ].join('\n')
      }

      await sendTelegram(team.telegram_bot_token, team.telegram_chat_id, message)
    } catch (err) {
      console.error(`[Cleanup] Error for team ${team.id}:`, err)
    }
  }
}

// ─── Daily summary (Cron) ────────────────────────────────────────────────────
async function sendDailySummaries(env: Env, isClosing: boolean): Promise<void> {
  const res = await supabaseFetch(env, `/teams?telegram_bot_active=eq.true&select=id,name,telegram_bot_token,telegram_chat_id`)
  const teams: { id: string; name: string; telegram_bot_token: string; telegram_chat_id: string }[] = await res.json()

  const today = new Date().toISOString().split('T')[0]
  const timeLabel = isClosing ? '🌙 *REPORTE DE CIERRE*' : '🌅 *REPORTE DE INICIO*'

  for (const team of teams) {
    const summary = await formatSummaryMessage(env, team.id, today, today, team.name)
    const header = `${timeLabel}\n📅 ${today}\n\n`
    await sendTelegram(team.telegram_bot_token, team.telegram_chat_id, header + summary)
  }
}

// ─── CORS Helpers ─────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

function corsResponse(body: string, status: number, extra: Record<string, string> = {}): Response {
    return new Response(body, {
        status,
        headers: {...CORS_HEADERS, 'Content-type': 'application/json', ...extra},
    })
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if(request.method === 'OPTIONS'){
      return new Response(null, {status: 204, headers: CORS_HEADERS})
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (request.method !== 'POST') {
      return corsResponse('Method not allowed', 405)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json() as Record<string, unknown>
    } catch {
      return corsResponse('Invalid JSON', 400)
    }

    const teamId = String(body.team_id ?? '')

    if (!teamId) return corsResponse('Missing team_id', 400)

    const team = await getTeamBot(env, teamId)
    if (!team) return corsResponse(JSON.stringify({ok: true, skipped: true}), 200)

    let message = ''

    try {
      if (path === '/notify/loan') {
        message = formatLoanMessage(body)
      } else if (path === '/notify/payment') {
        message = formatPaymentMessage(body)
      } else if (path === '/notify/expense') {
        message = formatExpenseMessage(body)
      } else if (path === '/notify/summary') {
        const dateFrom = String(body.date_from ?? new Date().toISOString().split('T')[0])
        const dateTo = String(body.date_to ?? new Date().toISOString().split('T')[0])
        message = await formatSummaryMessage(env, teamId, dateFrom, dateTo, team.name)
      } else {
        return corsResponse('Not found', 400)
      }

      await sendTelegram(team.telegram_bot_token!, team.telegram_chat_id!, message)
      return corsResponse(JSON.stringify({ ok: true }), 200)
    } catch (err) {
      console.error('[Worker] Error:', err)
      return corsResponse('Internal error', 500)
    }
  },

  async scheduled(_event: { scheduledTime: number; cron: string }, env: Env): Promise<void> {
    // 0 13 * * * = 8am Colombia (UTC-5)
    // 0 1 * * * = 8pm Colombia (UTC-5)
    // 0 10 * * 0 = 5am Colombia domingo
    if(_event.cron === '0 10 * * 0'){
        await runWeeklyCleanup(env)
    } else {
        const isClosing = new Date().getUTCHours() === 1
        await sendDailySummaries(env, isClosing)
    }
  },
}

