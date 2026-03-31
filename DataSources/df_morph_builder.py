def buckwalter_to_arabic_df(bw_string):
    if not isinstance(bw_string, str):
        return ""
    bw_string = re.sub(r"_#u", "&", bw_string) 
    if not isinstance(bw_string, str):
        return ""
    return ''.join(buckwalter_table.get(char, char) for char in bw_string)

def extract_value_from_features(features, key):
    if not isinstance(features, str):
        return ""
    match = re.search(rf'{key}:([^\|]+)', features)
    return match.group(1) if match else ""


def build_quran_morphology_df(file_path):
    df = pd.read_csv(file_path, sep="\t")

    # Extract Location parts (Surah:Ayah:WordIndex:SubIndex)
    def extract_parts(location):
        match = re.match(r"\((\d+):(\d+):(\d+):(\d+)\)", location)
        return tuple(map(int, match.groups())) if match else (None, None, None, None)

    def extract_verb_and_features(row):
        # Only process if this is a verb stem
        if "STEM" in row['FEATURES'] and row['TAG'] == "V":
            person = gender = number = None
            per_map = {'1': 'first person', '2': 'second person', '3': 'third person'}

            for feat in row['FEATURES'].split('|'):
                # Pattern: digit + M/F + S/P (e.g., 3MS, 2FP)
                m = re.match(r'([123])(M|F)(S|P|D)$', feat)
                if m:
                    per_digit, g, num_code = m.groups()
                    person = per_map[per_digit]
                    gender = 'masculine' if g == 'M' else 'feminine'
                    number = 'singular' if num_code == 'S' else 'dual' if num_code == 'D' else 'plural'
                    break

                # Pattern: digit + S/P (no gender, e.g., 1S, 1P)
                m2 = re.match(r'([123])(S|P|D)$', feat)
                if m2:
                    per_digit, num_code = m2.groups()
                    person = per_map[per_digit]
                    gender = None
                    number = 'singular' if num_code == 'S' else 'dual' if num_code == 'D' else 'plural'
                    break

            return row.get('Arabic', ''), person, gender, number

        return 'NOT VERB', None, None, None

    # Example usage: load your DataFrame
    # df = pd.read_excel('/mnt/data/your_verbs_file.xlsx')

    # Apply and expand into multiple columns:
    # df[['VERB_MAIN', 'Person', 'Gender', 'Number']] = df.apply(
    #     lambda row: pd.Series(
    #         extract_verb_and_features(row),
    #         index=['VERB_MAIN', 'Person', 'Gender', 'Number']
    #     ),
    #     axis=1
    # )

    # Display a preview to verify
    # from ace_tools import display_dataframe_to_user
    # display_dataframe_to_user(name="Verb Extraction Example", dataframe=df.head(10))




    df[['Surah', 'Ayah', 'WordIndex', 'SubIndex']] = df['LOCATION'].apply(lambda x: pd.Series(extract_parts(x)))

    # Extract Root, Lemma
    df['Root'] = df['FEATURES'].apply(lambda x: extract_value_from_features(x, "ROOT"))
    df['Lemma'] = df['FEATURES'].apply(lambda x: extract_value_from_features(x, "LEM"))

    # Prioritized field: root > lemma > form
    df['BW_Prioritized'] = df.apply(lambda row: row['Lemma'] or row['Root'] or row['FORM'], axis=1)
    df['Arabic'] = df['BW_Prioritized'].apply(buckwalter_to_arabic_df)

    df['FORM_Arabic'] = df['FORM'].apply(buckwalter_to_arabic_df)
    df['Lemma_Arabic'] = df['Lemma'].apply(buckwalter_to_arabic_df)
    df['Root_Arabic'] = df['Root'].apply(buckwalter_to_arabic_df)
    df[['VERB_MAIN', 'Person', 'Gender', 'Number']] = df.apply(
        lambda row: pd.Series(
            extract_verb_and_features(row),
            index=['VERB_MAIN', 'Person', 'Gender', 'Number']
        ),
        axis=1
    )



    # Clean output
    return df[['Surah', 'Ayah', 'WordIndex', 'SubIndex', 'TAG', 'FORM', 'Root', 'Lemma', 'Arabic', 'FEATURES','VERB_MAIN','Person', 'Gender', 'Number']].sort_values(by=['Surah', 'Ayah', 'WordIndex', 'SubIndex']).reset_index(drop=True)

df_morph = build_quran_morphology_df("quranic-corpus-morphology-0.4.txt")


def buckwalter_to_arabic_df(bw_string):
    if not isinstance(bw_string, str):
        return ""
    bw_string = re.sub(r"_#u", "&", bw_string) 
    if not isinstance(bw_string, str):
        return ""
    return ''.join(buckwalter_table.get(char, char) for char in bw_string)


def extract_value_from_features(features, key):
    if not isinstance(features, str):
        return ""
    match = re.search(rf'{key}:([^\|]+)', features)
    return match.group(1) if match else ""


def tag_expander(tag):
    mapping = {
        'N': 'noun',
        'V': 'verb',
        'P': 'prep',
        # add more as needed
    }
    return mapping.get(tag, tag)  # return original if not in mapping


def explain_tag(tag):
    return tag_explanation_map.get(tag, f"Unknown ({tag})")


df_morph['TAG_Explanation'] = df_morph['TAG'].apply(explain_tag)



verbs_with_meanings_roots = pd.read_excel("verbs_with_meanings_roots.xlsx")

verbs_with_meanings_roots['Arabic'] = verbs_with_meanings_roots['Arabic'].str.strip()
df_morph['Arabic'] = df_morph['Arabic'].str.strip()


df_morph = pd.merge(df_morph, verbs_with_meanings_roots[['Arabic', 'count', 'meaning', '3MSAP_root']], on='Arabic', how='left')


