class PasswordResetMailer < ApplicationMailer
  default from: -> { SiteConfig.mail_from }
  
  # @param [User] user
  def reset_password(user)
    @user = user
    @user.password_reset_token = SecureRandom.uuid
    @user.save
    mail( :to => @user.email,
          :subject => 'Walltaker Password Reset' )
  end
end
