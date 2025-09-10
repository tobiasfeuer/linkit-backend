import { type MongoUser, type UserEntity } from "../../domain/user/user.entity";
import {
  type MongoCompany,
  type CompanyEntity,
} from "../../domain/company/company.entity";
import { type AdminEntity } from "../../domain/admin/admin.entity";
import { userWelcomeMailCreate } from "./nodemailer/welcome/userWelcomeMail";
import { validateUserExists } from "../../helpers/validateAirtable";
import { type AuthRepository } from "./auth.repository";
import "dotenv/config";
import Admin from "../../infrastructure/schema/Admin";
import User from "../../infrastructure/schema/User";
import Company from "../../infrastructure/schema/Company";
import { MongoUserRepository } from "../../infrastructure/repository/User.repository";
import { MongoCompanyRepository } from "../../infrastructure/repository/Company.repository";
import { MongoAdminRepository } from "../../infrastructure/repository/Admin.repository";
import { objectIDValidator } from "../../infrastructure/helpers/validateObjectID";
import { type MailNodeMailerProvider } from "./nodemailer/nodeMailer";
import { ServerError, UncatchedError } from "../../../errors/errors";
import { companyWelcomeMailCreate } from "./nodemailer/welcome/companyWelcomeMail";
import { admin } from "../firebase";

interface registeringUser extends UserEntity {
  password: string;
}

interface registeringCompany extends CompanyEntity {
  password: string;
}

interface registeringAdmin extends AdminEntity {
  password: string;
}

export type CustomType =
  | registeringUser
  | registeringCompany
  | registeringAdmin;

export class AuthMongoRepository implements AuthRepository {
  constructor(private readonly mailNodeMailerProvider: MailNodeMailerProvider) {
    this.mailNodeMailerProvider = mailNodeMailerProvider;
  }

 async register(
  entity: CustomType,
  firebaseId?: string
): Promise<UserEntity | CompanyEntity | AdminEntity | string> {
  try {
    validateUserExists(entity)
    if (!entity.password) {
      throw new ServerError("Missing password", "Contraseña invalida", 406);
    }

    let entityCreated;
    let provider;
    let updateMethod;

    if (entity.role === "user") {
      provider = new MongoUserRepository(this.mailNodeMailerProvider);
      updateMethod = provider.editUser;
      entityCreated = await provider.createUser(entity as UserEntity);
    } else if (entity.role === "company") {
      provider = new MongoCompanyRepository(this.mailNodeMailerProvider);
      updateMethod = provider.editCompany;
      entityCreated = await provider.createCompany(entity as CompanyEntity);
    } else if (entity.role === "admin") {
      provider = new MongoAdminRepository(this.mailNodeMailerProvider);
      updateMethod = provider.editAdmin;
      entityCreated = await provider.createAdmin(entity as AdminEntity);
    } else {
      throw new ServerError(
        "Entity was not created, role does not exist",
        "No se creo entidad, el rol no existe",
        406
      );
    }

    if (firebaseId) {
      await updateMethod((entityCreated as any)._id, {
        firebaseId: firebaseId,
      });
      entityCreated.firebaseId = firebaseId;
    }

    return entityCreated;
  } catch (error: any) {
    console.error("Error in register:", error);
    if (error instanceof ServerError) throw error;
    else
      throw new UncatchedError(
        error.message,
        "register",
        "registrar entidad"
      );
  }
}

  async login(
    token: string,
    role: string
  ): Promise<UserEntity | CompanyEntity | AdminEntity> {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const email = decoded.email;
      const emailVerified = decoded.email_verified; // <-- importante

      if (!email) {
        throw new ServerError(
          "Invalid token: no email found",
          "Token inválido: no se encontró email",
          401
        );
      }

      let result1, result2, result;
      if (role === "user") {
        result1 = await User.find({ email });
        result2 = await Admin.find({ email });

        if (result1.length) {
          // TEMPORAL: Comentado para deshabilitar verificación de email
          // Si el usuario está verificado en Firebase pero no en Mongo, actualiza
          // if (emailVerified && !result1[0].active) {
          //   await User.updateOne({ email }, { $set: { active: true } });
          //   result1[0].active = true;
          // }
          
          // TEMPORAL: Activar automáticamente sin verificación
          if (!result1[0].active) {
            await User.updateOne({ email }, { $set: { active: true } });
            result1[0].active = true;
          }
          
          if (result1[0].active) {
            return result1[0] as UserEntity;
          } else {
            throw new ServerError(
              "Unverified email, please check your inbox or spam",
              "Email no verificado, por favor revisa tu bandeja de entrada o spam",
              406
            );
          }
        }
        if (result2.length) {
          // TEMPORAL: Comentado para deshabilitar verificación de email
          // if (emailVerified && !result2[0].active) {
          //   await Admin.updateOne({ email }, { $set: { active: true } });
          //   result2[0].active = true;
          // }
          
          // TEMPORAL: Activar automáticamente sin verificación
          if (!result2[0].active) {
            await Admin.updateOne({ email }, { $set: { active: true } });
            result2[0].active = true;
          }
          
          if (result2[0].active) {
            return result2[0] as AdminEntity;
          } else {
            throw new ServerError(
              "Unverified email, please check your inbox or spam",
              "Email no verificado, por favor revisa tu bandeja de entrada o spam",
              406
            );
          }
        }
      } else if (role === "company") {
        result = await Company.find({ email });
        if (result.length) {
          // TEMPORAL: Comentado para deshabilitar verificación de email
          // if (emailVerified && !result[0].active) {
          //   await Company.updateOne({ email }, { $set: { active: true } });
          //   result[0].active = true;
          // }
          
          // TEMPORAL: Activar automáticamente sin verificación
          if (!result[0].active) {
            await Company.updateOne({ email }, { $set: { active: true } });
            result[0].active = true;
          }
          
          if (result[0].active) {
            return result[0] as CompanyEntity;
          } else {
            throw new ServerError(
              "Unverified email, please check your inbox or spam",
              "Email no verificado, por favor revisa tu bandeja de entrada o spam",
              406
            );
          }
        }
      } else {
        throw new ServerError(
          "Provide a valid role for login",
          "Debes brindar un rol válido para iniciar sesión",
          406
        );
      }

      throw new ServerError(
        `${role} not found, please be sure you are using the right login for your role`,
        "Registro no encontrado, asegurate que estas iniciando sesión desde la sección correcta",
        404
      );
    } catch (error: any) {
      if (error instanceof ServerError) throw error;
      else
        throw new UncatchedError(error.message, "signin in", "iniciar sesión");
    }
  }

  async verify(id: string, role: string): Promise<string> {
    try {
      if (id === "undefined" || role === "undefined")
        throw new ServerError(
          "Missing user information",
          "Falta informacion del usuario",
          406
        );
      objectIDValidator(id, "user to verify", "usuario a verificar");
      if (role === "user") {
        const user = await User.findById(id);
        if (!user)
          throw new ServerError(
            "No User found with that id",
            "No se encuentra un usuario con ese ID",
            404
          );
        await User.updateOne(
          { _id: user._id },
          { $set: { active: true } },
          { new: true }
        );
        await this.mailNodeMailerProvider.sendEmail(
          userWelcomeMailCreate(user as MongoUser)
        );
      } else if (role === "company") {
        const company = await Company.findById(id);
        if (!company)
          throw new ServerError(
            "No Company found with that id",
            "No se encuentra una empresa con ese ID",
            404
          );
        await Company.updateOne(
          { email: company.email },
          { $set: { active: true } },
          { new: true }
        );
        await this.mailNodeMailerProvider.sendEmail(
          companyWelcomeMailCreate(company as MongoCompany)
        );
      } else if (role === "admin") {
        const admin = await Admin.findById(id);
        if (!admin)
          throw new ServerError(
            "No admin found with that id",
            "No se encuentra un administrador con ese ID",
            404
          );
        await Admin.updateOne(
          { email: admin.email },
          { $set: { active: true } },
          { new: true }
        );
      } else {
        throw new ServerError("Not a valid role", "El rol no es valido", 409);
      }
      return "Completed";
    } catch (error: any) {
      if (error instanceof ServerError) throw error;
      else
        throw new UncatchedError(
          error.message,
          "verifying",
          "verificar usuario"
        );
    }
  }

  // async resetPassword(email: string): Promise<void> {
  //   try {
  //     const auth = getAuth();
  //     await sendPasswordResetEmail(auth, email);
  //   } catch (error: any) {
  //     throw new UncatchedError(
  //       error.message,
  //       "sending password reset email",
  //       "enviar email de restablecimiento de contraseña"
  //     );
  //   }
  // }
}
