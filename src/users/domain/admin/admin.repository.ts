import { type permissions, type AdminEntity } from './admin.entity'

export interface AdminRepository {
  deleteAdminPermanently: (id: string) => Promise<AdminEntity[]>,
  findAdmin: (value: string, filter: string) => Promise<AdminEntity | AdminEntity[]>
  createAdmin: (admin: AdminEntity) => Promise<AdminEntity>
  editAdmin: (id: string, admin: AdminEntity) => Promise<AdminEntity>
  deleteAdmin: (id: string, reqID?: string, total?: string) => Promise<AdminEntity[]>
  editPermissions: (id: string, permissions: permissions) => Promise<AdminEntity>
}
