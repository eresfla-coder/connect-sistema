import sharp from 'sharp'
import { copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src =
  process.argv[2] ||
  'C:/Users/User/.cursor/projects/c-orcamento-app-my-next-app/assets/c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ChatGPT_Image_Jul_1__2026__01_59_23_PM-5169da62-905f-4833-bd58-fb12a0fd3ffe.png'

const publicDir = join(root, 'public')
const iconsDir = join(publicDir, 'icons')
mkdirSync(iconsDir, { recursive: true })

const sizes = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512]

async function resize(size, outPath) {
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(outPath)
}

await sharp(src).png().toFile(join(publicDir, 'logo-connect.png'))

for (const size of sizes) {
  const name =
    size <= 32
      ? `favicon-${size}x${size}.png`
      : `icon-${size}x${size}.png`
  await resize(size, join(iconsDir, name))
}

await resize(192, join(iconsDir, 'maskable-192x192.png'))
await resize(512, join(iconsDir, 'maskable-512x512.png'))

copyFileSync(join(iconsDir, 'icon-180x180.png'), join(iconsDir, 'apple-touch-icon.png'))
copyFileSync(join(iconsDir, 'icon-180x180.png'), join(publicDir, 'apple-touch-icon.png'))
copyFileSync(join(iconsDir, 'favicon-32x32.png'), join(publicDir, 'favicon.ico'))

console.log('Icones Connect gerados em public/')
