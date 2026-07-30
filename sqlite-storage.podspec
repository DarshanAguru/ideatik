Pod::Spec.new do |spec|
  spec.name = 'react-native-sqlite-storage'
  spec.version = '6.0.1'
  spec.summary = 'React Native SQLite bridge compatibility podspec'
  spec.license = { :type => 'MIT' }
  spec.authors = { 'Ideatik' => 'support@ideatik.local' }
  spec.homepage = 'https://github.com/andpor/react-native-sqlite-storage'
  spec.platforms = { :ios => '13.0' }
  spec.source = { :path => '.' }
  spec.source_files = 'node_modules/react-native-sqlite-storage/platforms/ios/*.{h,m}'
  spec.dependency 'React-Core'
  spec.libraries = 'sqlite3'
end
