import { z } from 'zod'
import type { CustomerProfile } from '../types/domain'

const customerBackupSchema = z.object({
  id: z.string().uuid(),
  householdName: z.string(),
  primaryContactName: z.string(),
  city: z.string(),
  notes: z.string(),
  members: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
  assets: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), currentValue: z.number().nonnegative(), liquidity: z.string(), availableForEmergency: z.boolean() }).passthrough()),
  liabilities: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), balance: z.number().nonnegative(), monthlyPayment: z.number().nonnegative(), dueWithinOneYear: z.number().nonnegative(), remainingMonths: z.number().nonnegative().nullable() }).passthrough()),
  incomes: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), amount: z.number().nonnegative(), frequency: z.enum(['monthly','quarterly','yearly']) }).passthrough()),
  expenses: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), amount: z.number().nonnegative(), frequency: z.enum(['monthly','quarterly','yearly']) }).passthrough()),
  educationGoals: z.array(z.object({ id: z.string() }).passthrough()),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
}).passthrough()

const backupPayloadSchema = z.object({
  format: z.literal('family-asset-analyzer'),
  version: z.literal(1),
  exportedAt: z.string(),
  customers: z.array(customerBackupSchema),
})

interface EncryptedBackup {
  format: 'family-asset-analyzer-encrypted'
  version: 1
  algorithm: 'AES-GCM'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export async function createEncryptedBackup(customers: CustomerProfile[], password: string) {
  if (password.length < 8) throw new Error('备份密码至少需要 8 位')
  const payload = JSON.stringify({ format: 'family-asset-analyzer', version: 1, exportedAt: new Date().toISOString(), customers })
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const iterations = 210_000
  const key = await deriveKey(password, salt, iterations)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload))
  const encrypted: EncryptedBackup = {
    format: 'family-asset-analyzer-encrypted', version: 1, algorithm: 'AES-GCM', iterations,
    salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(encrypted)
}

export async function readEncryptedBackup(text: string, password: string): Promise<CustomerProfile[]> {
  if (text.length > 20_000_000) throw new Error('备份文件过大，请分批处理')
  let encrypted: EncryptedBackup
  try { encrypted = JSON.parse(text) as EncryptedBackup } catch { throw new Error('无法读取这个备份文件') }
  if (encrypted.format !== 'family-asset-analyzer-encrypted' || encrypted.version !== 1 || encrypted.algorithm !== 'AES-GCM' || encrypted.iterations !== 210_000) {
    throw new Error('这不是受支持的资产分析备份')
  }
  try {
    const salt = base64ToBytes(encrypted.salt)
    const iv = base64ToBytes(encrypted.iv)
    const key = await deriveKey(password, salt, encrypted.iterations)
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(encrypted.ciphertext))
    const payload = backupPayloadSchema.parse(JSON.parse(new TextDecoder().decode(clear)))
    return payload.customers as unknown as CustomerProfile[]
  } catch { throw new Error('密码不正确，或备份文件已经损坏') }
}
