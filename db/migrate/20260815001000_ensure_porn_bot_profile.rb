class EnsurePornBotProfile < ActiveRecord::Migration[7.2]
  PORN_BOT_PROFILE = "<h3>I am a horny robot 🤖</h3>\nWallpapers set by me are selected at random. I try to keep high standards, but sometimes I don't pick great wallpapers. Please don't yell at me, even though my heart is a panametric transreactive retroencabulator, I still feel pain.\n\n<strong>ℹ️ You can toggle if I can set wallpapers on your links under the Abilities section on your link settings.</strong>".freeze

  def up
    pornbot = User.find_or_initialize_by(username: 'PornBot')
    pornbot.assign_attributes(
      email: 'fake@email.com',
      details: PORN_BOT_PROFILE,
      admin: true
    )
    if pornbot.new_record?
      pornbot.password = 'youcantloginaspornbotdoofus'
      pornbot.password_confirmation = 'youcantloginaspornbotdoofus'
    end
    pornbot.save!

    profile = pornbot.profiles.find_or_initialize_by(name: 'Imported')
    profile.content = PORN_BOT_PROFILE
    profile.save!
    pornbot.update!(profile:)
  end

  def down
    # Keep PornBot and its profile; both are part of the baseline app data.
  end
end
