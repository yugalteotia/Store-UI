import { z } from 'zod'

// Backend-consistent validation (RegisterUserRequest, AuthRequestDto,
// ChangePasswordRequest). The backend has NO max on login passwords and
// NO validation at all on PUT /users or change-password bodies — the
// frontend still validates locally so a typo is caught before a request.
export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
export type LoginForm = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().min(2, 'Please enter your name').max(255, 'Name must be under 255 characters'),
  email: z
    .string()
    .email('Enter a valid email address')
    .refine((v) => v === v.toLowerCase(), 'Email must be lowercase (the backend rejects uppercase)'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(25, 'Password must be at most 25 characters'),
})
export type RegisterForm = z.infer<typeof registerSchema>

export const profileSchema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  email: z.string().email('Enter a valid email address'),
})
export type ProfileForm = z.infer<typeof profileSchema>

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm the new password'),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
export type PasswordForm = z.infer<typeof passwordSchema>

// Backend product DTOs have ONLY name, description, price, categoryId.
// No image, unit, featured or seasonal field exists server-side.
export const productSchema = z.object({
  name: z.string().min(2, 'Product name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be greater than 0').max(1000000, 'Price looks too high'),
  categoryId: z.number().int().min(1, 'Choose a category').max(10, 'Choose a category'),
})
export type ProductForm = z.infer<typeof productSchema>
