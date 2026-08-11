const SUPABASE_URL = 'https://nmocuhzyplzgbvbqehim.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs'

const PASSWORD = 'ramon123'
const DRIVER_NAMES = ['anacacho', 'andersonmage', 'betinhovale']

// Candidatos de email para tentar
const EMAIL_CANDIDATES = [
  'ramon@jackarlos.com',
  'ramon@gmail.com',
  'ramon@jackarlos.com.br',
  'admin@jackarlos.com',
  'ramon@admin.com',
]

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password })
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function queryWithToken(token, endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    },
    ...options
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function main() {
  console.log('🔐 Tentando autenticar...\n')

  let accessToken = null
  let usedEmail = null

  for (const email of EMAIL_CANDIDATES) {
    process.stdout.write(`  Tentando: ${email} ... `)
    const { status, data } = await signIn(email, PASSWORD)
    if (status === 200 && data.access_token) {
      accessToken = data.access_token
      usedEmail = email
      console.log('✅ SUCESSO!')
      break
    } else {
      console.log(`❌ (${data.error_description || data.error || status})`)
    }
  }

  if (!accessToken) {
    console.log('\n❌ Não foi possível autenticar com nenhum email testado.')
    console.log('Por favor, informe o email completo do usuário ramon.')
    process.exit(1)
  }

  console.log(`\n✅ Autenticado como: ${usedEmail}\n`)

  // Busca todos os drivers
  const { status: drvStatus, data: drivers } = await queryWithToken(accessToken, 'drivers?select=id,name&order=name')

  if (drvStatus !== 200) {
    console.error('❌ Erro ao buscar drivers:', drivers)
    process.exit(1)
  }

  console.log(`📋 Total de entregadores no banco: ${drivers.length}`)
  drivers.forEach(d => console.log(`   - ${d.name}`))

  // Filtra os drivers alvo
  const targetDrivers = drivers.filter(d =>
    DRIVER_NAMES.some(n => d.name.toLowerCase().replace(/\s/g,'').includes(n.toLowerCase()))
  )

  if (targetDrivers.length === 0) {
    console.log('\n⚠️  Nenhum entregador encontrado com os nomes:', DRIVER_NAMES.join(', '))
    console.log('Verifique os nomes acima e tente novamente.')
    process.exit(0)
  }

  console.log(`\n🎯 Entregadores alvo encontrados (${targetDrivers.length}):`)
  targetDrivers.forEach(d => console.log(`   - ${d.name} [${d.id}]`))

  // Deleta pacotes finalizados de cada driver
  let totalDeleted = 0
  for (const driver of targetDrivers) {
    console.log(`\n📦 Processando "${driver.name}"...`)

    // Conta pacotes finalizados
    const { data: pkgs } = await queryWithToken(
      accessToken,
      `packages?driver_id=eq.${driver.id}&status=in.(ENTREGUE,DEVOLVIDA)&select=id,barcode,status`
    )

    if (!Array.isArray(pkgs) || pkgs.length === 0) {
      console.log(`   ℹ️  Nenhum pacote finalizado.`)
      continue
    }

    console.log(`   📋 ${pkgs.length} pacote(s) finalizado(s) encontrado(s). Deletando...`)

    const { status: delStatus, data: delResult } = await queryWithToken(
      accessToken,
      `packages?driver_id=eq.${driver.id}&status=in.(ENTREGUE,DEVOLVIDA)`,
      { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } }
    )

    if (delStatus === 200 || delStatus === 204 || delStatus === 201) {
      console.log(`   ✅ ${pkgs.length} pacote(s) deletado(s)!`)
      totalDeleted += pkgs.length
    } else {
      console.error(`   ❌ Erro ao deletar (status ${delStatus}):`, delResult)
    }
  }

  console.log(`\n🎉 Concluído! Total de pacotes removidos: ${totalDeleted}`)
}

main().catch(console.error)
