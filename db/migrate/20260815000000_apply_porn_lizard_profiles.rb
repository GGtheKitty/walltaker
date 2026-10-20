class ApplyPornLizardProfiles < ActiveRecord::Migration[7.2]
  LIZARD_PROFILES = {
    'PornLizardKi' => "Latex is hufffff but dont be too weird ok? (slime though, thats not weird)",
    'PornLizardWarren' => "HORSE COCK HORSE COCK HORSE COCK HORSE COCK HORSE COCK! I don't know what to put here lol. Not paid nearly enough to pick wallpapers for you pervs. FAT COCK FAT TITS PEACE OUT, going to go cum on my 6th big titty sex doll.",
    'PornLizardTaylor' => "✨whats up people!✨<br/><h4>Welcome to my Walltaker Page!</h4><br/>Have a look at all the posts I've made to get a sense of my general vibe. It's a little bit cum slut, a little bit bad bitch. I'll set you up right~ 😈<br/><br/>(also like, you can plow my cunt no questions asked, just show me your Walltaker account if we meet sometime and my womb is all yours. 😽)",
  }.freeze

  def up
    LIZARD_PROFILES.each do |username, content|
      user = User.find_by(username:)
      next unless user

      # Profile's default scope joins User.active, which depends on the
      # deleted_at column added by a later migration. Avoid application scopes
      # here so this migration also works when building a database from scratch.
      profile = Profile.unscoped.find_or_initialize_by(user_id: user.id, name: 'Imported')
      profile.content = content
      profile.save!
      user.update!(profile:)
    end
  end

  def down
    # Keep the profile rows; they may have been edited or selected by users after migration.
  end
end
