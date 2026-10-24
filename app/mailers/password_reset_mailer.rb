class PasswordResetMailer < ApplicationMailer
  default from: -> { SiteConfig.mail_from }
  
  # @param [User] user
  def reset_password(user, token: nil)
    @user = user
    if token
      @user.password_reset_token = token
      @node_issued_token = true
    else
      @user.password_reset_token = SecureRandom.uuid
      @user.save
    end
    mail( :to => @user.email,
          :subject => 'Walltaker Password Reset' )
  end
end
