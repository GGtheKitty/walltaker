# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
#
# Examples:
#
#   movies = Movie.create([{ name: "Star Wars" }, { name: "Lord of the Rings" }])
#   Character.create(name: "Luke", movie: movies.first)

bot_profiles = {
  'PornBot' => "<h3>I am a horny robot 🤖</h3>\nWallpapers set by me are selected at random. I try to keep high standards, but sometimes I don't pick great wallpapers. Please don't yell at me, even though my heart is a panametric transreactive retroencabulator, I still feel pain.\n\n<strong>ℹ️ You can toggle if I can set wallpapers on your links under the Abilities section on your link settings.</strong>",
  'PornLizardKi' => "Latex is hufffff but dont be too weird ok? (slime though, thats not weird)",
  'PornLizardWarren' => "HORSE COCK HORSE COCK HORSE COCK HORSE COCK HORSE COCK! I don't know what to put here lol. Not paid nearly enough to pick wallpapers for you pervs. FAT COCK FAT TITS PEACE OUT, going to go cum on my 6th big titty sex doll.",
  'PornLizardTaylor' => "✨whats up people!✨<br/><h4>Welcome to my Walltaker Page!</h4><br/>Have a look at all the posts I've made to get a sense of my general vibe. It's a little bit cum slut, a little bit bad bitch. I'll set you up right~ 😈<br/><br/>(also like, you can plow my cunt no questions asked, just show me your Walltaker account if we meet sometime and my womb is all yours. 😽)",
}

apply_bot_profile = ->(user) do
  profile = user.profiles.find_or_initialize_by(name: 'Imported')
  profile.content = bot_profiles.fetch(user.username)
  profile.save!
  user.update!(profile:)
end

system_account_attributes = -> {
  {
    system_account: true,
    password_digest: BCrypt::Password.create(SecureRandom.base64(48))
  }
}

Apple = User.create({
                      email: 'a@a.com',
                      username: 'apple',
                      details: '',
                    }.merge(system_account_attributes.call))
Banana = User.create({
                       email: 'b@b.com',
                       username: 'banana',
                       details: '',
                     }.merge(system_account_attributes.call))
Cherry = User.create({
                       email: 'c@c.com',
                       username: 'cherry',
                       details: '',
                     }.merge(system_account_attributes.call))
Evil = User.create({
                     email: 'e@e.com',
                     username: 'evil',
                     details: '',
                   }.merge(system_account_attributes.call))
Friendship.create({
                    sender_id: Apple.id,
                    receiver_id: Banana.id,
                    confirmed: true
                  })

pornbot = User.new({
                     username: 'PornBot',
                     email: 'fake@email.com',
                     details: bot_profiles.fetch('PornBot'),
                     admin: true
                   }.merge(system_account_attributes.call))

puts "Made admin user PornBot" if pornbot.valid?
puts "DID NOT make admin user PornBot. #{pornbot.errors.map {|error| error.full_message }.join(', ')}" unless pornbot.valid?

pornbot.save

apply_bot_profile.call(pornbot) if pornbot.persisted?

ki = User.new({
                username: 'PornLizardKi',
                email: 'ki@invalidemail.com',
                details: bot_profiles.fetch('PornLizardKi'),
                admin: false
              }.merge(system_account_attributes.call))

puts "Made Ki" if ki.valid?
puts "DID NOT make Ki. #{ki.errors.map {|error| error.full_message }.join(', ')}" unless ki.valid?

ki.save

apply_bot_profile.call(ki) if ki.persisted?


warren = User.new({
                    username: 'PornLizardWarren',
                    email: 'warren@invalidemail.com',
                    details: bot_profiles.fetch('PornLizardWarren'),
                    admin: false
                  }.merge(system_account_attributes.call))

puts "Made warren" if warren.valid?
puts "DID NOT make warren. #{warren.errors.map {|error| error.full_message }.join(', ')}" unless warren.valid?

warren.save

apply_bot_profile.call(warren) if warren.persisted?


taylor = User.new({
                    username: 'PornLizardTaylor',
                    email: 'taylor@invalidemail.com',
                    details: bot_profiles.fetch('PornLizardTaylor'),
                    admin: false
                  }.merge(system_account_attributes.call))

puts "Made taylor" if taylor.valid?
puts "DID NOT make taylor. #{taylor.errors.map {|error| error.full_message }.join(', ')}" unless taylor.valid?

taylor.save

apply_bot_profile.call(taylor) if taylor.persisted?
