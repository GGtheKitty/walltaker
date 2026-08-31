class CreateWallpaperClients < ActiveRecord::Migration[7.2]
  CLIENTS = [
    {
      name: "Lycraon's Wallpaper Engine Client", section: 'clients',
      url: 'https://github.com/Lycraon/Walltaker-for-WallpaperEngine', platform: 'Wallpaper Engine for Windows',
      match_text: 'Wallpaper-Engine-Client', link_name: "Lycraon's Wallpaper Engine", icon_name: 'cog',
      device_type: 'desktop', position: 10, match_position: 40
    },
    {
      name: "Gios' Android Client", section: 'clients',
      url: 'https://github.com/gios2/Walltaker-Changer/releases/latest', platform: 'Android 7+',
      match_text: 'Walltaker-Changer/', link_name: 'Gios Changer', icon_name: 'logo-octocat',
      device_type: 'mobile', position: 20, match_position: 90
    },
    {
      name: "GG's Android Widget", section: 'clients',
      url: 'https://github.com/GGtheKitty/GGs-Walltaker-Widget/releases/latest', platform: 'Android 12+',
      match_text: 'GGWidget/', link_name: "GG's Android Widget", icon_name: 'aperture-outline',
      device_type: 'mobile', position: 30, match_position: 110
    },
    {
      name: 'Desktop Client', section: 'clients',
      url: 'https://github.com/GGtheKitty/Walltaker-Desktop-Client', platform: 'Windows / Linux',
      match_text: 'Walltaker Client', link_name: 'Walltaker Desktop', icon_name: 'laptop-outline',
      device_type: 'desktop', position: 40, match_position: 10
    },
    {
      name: 'macOS Client', section: 'clients', url: 'https://github.com/PawCorp/walltaker-macos/releases/latest',
      platform: 'macOS', deprecated: true, match_text: 'CFNetwork/', link_name: 'Mac Client',
      icon_name: 'logo-apple', device_type: 'desktop', position: 50, match_position: 80
    },
    {
      name: 'iOS Widget', section: 'clients', url: 'https://github.com/PawCorp/walltaker/blob/main/ios.md#ios-widget',
      platform: 'iOS', deprecated: true, match_text: 'widgetExtension', link_name: 'iOS Widget',
      icon_name: 'logo-apple', device_type: 'mobile', position: 60, match_position: 70
    },
    {
      name: 'Popout Viewer', section: 'clients', url: 'https://github.com/FerretPaws/WalltakerPopOutViewer',
      platform: 'Windows', deprecated: true, match_text: 'WTPopOutViewer', link_name: 'WT Popout',
      icon_name: 'paw', device_type: 'desktop', position: 70, match_position: 180
    },
    {
      name: 'Android Client', section: 'clients',
      url: 'https://github.com/PawCorp/walltaker-android-client/releases/latest', platform: 'Android 12+',
      deprecated: true, match_text: 'walltaker-android-client/', link_name: 'Pawcorp Android',
      icon_name: 'phone-portrait-outline', device_type: 'mobile', position: 80, match_position: 20
    },
    {
      name: "Gios' Explorer", section: 'companion_apps',
      url: 'https://github.com/gios2/Walltaker-Explorer/releases/latest', platform: 'Android 7+',
      position: 10, match_position: 190
    },
    { name: 'JOI.how', match_text: 'joihow', link_name: 'JOI.how', icon_name: 'earth-outline', device_type: 'desktop', match_position: 30 },
    { name: "Deans' Client", match_text: 'walltaker-android-automate', link_name: "Deans' Client", icon_name: 'phone-portrait-outline', device_type: 'mobile', match_position: 50 },
    { name: "Arson's Client", match_text: 'arson-walltaker-automate', link_name: "Arson's Client", icon_name: 'bonfire', device_type: 'mobile', match_position: 60 },
    { name: 'Gios Checker', match_text: 'Walltaker-Checker/', link_name: 'Gios Checker', icon_name: 'logo-gitlab', device_type: 'desktop', match_position: 100 },
    { name: "JBerliner's Walltaker.sh", match_text: 'JBerliner', link_name: "JBerliner's Walltaker.sh", icon_name: 'pint', device_type: 'desktop', match_position: 120 },
    { name: 'Walltaker Engine', match_text: 'WalltakerEngine-chewtoy/', link_name: 'Walltaker Engine', icon_name: 'car-sport', device_type: 'desktop', match_position: 130 },
    { name: 'Walltaker For Walltaker', match_text: 'Walltaker for Walltaker (kemkem)', link_name: 'Walltaker For Walltaker', icon_name: 'sync-circle-outline', device_type: 'desktop', match_position: 140 },
    { name: 'Walltaker eXPerience', match_text: 'Walltaker_eXPerience', link_name: 'Walltaker eXPerience', icon_name: 'terminal-outline', device_type: 'desktop', match_position: 150 },
    { name: "Pawslut's Client", match_text: 'PawSlut', link_name: "Pawslut's Client", icon_name: 'paw', device_type: 'desktop', match_position: 160 },
    { name: "Collin's Walltaker Setter Thing", match_text: "umbrella Collin's Walltaker Setter Thing", link_name: "Collin's Walltaker Setter Thing", icon_name: 'umbrella', device_type: 'desktop', match_position: 170 }
  ].freeze

  def change
    create_table :wallpaper_clients do |t|
      t.string :name, null: false
      t.string :section, null: false, default: 'hidden'
      t.string :url
      t.string :platform
      t.boolean :deprecated, null: false, default: false
      t.string :match_text
      t.string :link_name
      t.string :icon_name
      t.string :device_type
      t.integer :position, null: false, default: 0
      t.integer :match_position, null: false, default: 0

      t.timestamps
    end

    reversible do |direction|
      direction.up do
        wallpaper_client = Class.new(ActiveRecord::Base) do
          self.table_name = 'wallpaper_clients'
        end
        now = Time.current
        defaults = {
          section: 'hidden', url: nil, platform: nil, deprecated: false, match_text: nil, link_name: nil,
          icon_name: nil, device_type: nil, position: 0, match_position: 0, created_at: now, updated_at: now
        }
        wallpaper_client.insert_all!(CLIENTS.map { |client| defaults.merge(client) })
      end
    end
  end
end
